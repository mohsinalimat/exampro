from datetime import datetime, timedelta
import frappe
from frappe import _
from frappe.utils.data import markdown
from frappe.utils import now, get_fullname

from exampro.exam_pro.doctype.exam_submission.exam_submission import \
	get_current_qs

# ACTIVE_EXAM_CODE_CACHE = "ACTIVEEXAMCODECACHE"

def get_live_exam(member=None):
	"""
	Get upcoming/ongoing exam of a candidate.

	Check if current time is inbetween start and end time
	Function returns only one live/upcoming exam details
	even if multiple entries are there.
	"""
	exam_details = {}

	submissions = frappe.get_all(
		"Exam Submission",
		{"candidate": member or frappe.session.user},[
			"name",
			"exam_schedule",
			"status",
			"exam_started_time",
			"exam_submitted_time",
			"additional_time_given"
   ])
	for submission in submissions:
		if submission["status"] in ["Registration Cancelled", "Aborted"]:
			continue

		schedule = frappe.get_doc("Exam Schedule", submission["exam_schedule"])
		exam = frappe.get_doc("Exam", schedule.exam)

		# end time is schedule start time + duration + additional time given
		end_time = schedule.start_date_time + timedelta(minutes=schedule.duration) + \
			timedelta(minutes=submission["additional_time_given"])

		exam_details = {
			"exam_submission": submission["name"],
			"exam": schedule.exam,
			"exam_schedule": submission["exam_schedule"],
			"start_time": schedule.start_date_time,
			"end_time": end_time,
			"additional_time_given": submission["additional_time_given"],
			"submission_status": submission["status"],
			"duration": schedule.duration,
			"enable_calculator": exam.enable_calculator,
			"live_status": "",
			"submission_status": submission["status"],
			"enable_video_proctoring": exam.enable_video_proctoring,
			"enable_chat": exam.enable_chat,
			"enable_calculator": exam.enable_calculator
		}

		# make datetime in isoformat
		for key,val in exam_details.items():
			if type(val) == datetime:
				exam_details[key] = val.isoformat()

		# checks if current time is between schedule start and end time
		# ongoing exams can be in Not staryed, started or submitted states
		tnow = datetime.strptime(now(), '%Y-%m-%d %H:%M:%S.%f')
		if schedule.start_date_time <= tnow <= end_time:
			exam_details["live_status"] = "Live"
			return exam_details
		elif tnow <= schedule.start_date_time:
			exam_details["live_status"] = "Upcoming"
			return exam_details
		elif tnow > end_time:
			# if time is over, submit if applicable
			if submission["status"] != "Submitted":
				doc = frappe.get_doc("Exam Submission", submission["name"])
				doc.status == "Submitted"
				doc.save(ignore_permissions=True)

			return {}

	return exam_details

def get_assigned_exams(user):
    """Get all exams assigned to the evaluator"""
    assigned_exams = frappe.get_all(
        "Exam Submission",
        filters={
            "evaluator": user,
            "status": ["in", ["Submitted", "Evaluation In Progress"]]
        },
        fields=["name as submission_id", "exam", "candidate", "status", 
                "exam_schedule", "total_marks", "obtained_marks"]
    )

    for exam in assigned_exams:
        exam_doc = frappe.get_doc("Exam", exam.exam)
        exam.title = exam_doc.title
        exam.candidate_name = get_fullname(exam.candidate)
        
    return assigned_exams

def get_context(context):
    context.no_cache = 1

    if frappe.session.user == "Guest":
        raise frappe.PermissionError(_("Please login to access this page."))
    
    # Check if user is an evaluator
    if not frappe.db.exists("Examiner", {"user": frappe.session.user}):
        raise frappe.PermissionError(_("You are not authorized to access this page."))
        
    context.assigned_exams = get_assigned_exams(frappe.session.user)
    context.page_context = {}

	if not exam_details:
		context.exam = {}
		context.alert = {
			"title": "No exams scheduled.",
			"text": "You do not have any live or upcoming exams."
		}
	elif exam_details["submission_status"] == "Submitted":
		context.exam = {}
		context.alert = {
			"title": "Exam submitted!",
			"text": "You have already submitted your previous exam: {}.".format(
				exam_details["exam"]
			)
		}
	elif exam_details["live_status"] == "Live":
		context.alert = {}
		exam = frappe.db.get_value(
			"Exam", exam_details["exam"], ["name","title", "instructions"], as_dict=True
		)
		for key, value in exam_details.items():
			exam[key] = value

		exam["instructions"] = markdown(exam["instructions"])
		exam["current_qs"] = 1
		# return the last question requested in this exam, if applicable
		if exam["submission_status"] == "Started":
			_, current_qs_no = get_current_qs(exam_details["exam_submission"]) 
			exam["current_qs"] = current_qs_no or 1
		context.exam = exam

		context.metatags = {
			"title": exam.title,
			"image": exam.image,
			"description": exam.description,
			"keywords": exam.title,
			"og:type": "website",
		}


	elif exam_details["live_status"] == "Upcoming":
		context.exam = {}
		context.alert = {
			"title": "You have an upcoming exam.",
			"text": "{} exam starts at {}".format(
				exam_details["exam"],
				exam_details["start_time"]
		)}
