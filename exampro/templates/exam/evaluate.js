frappe.ready(function() {
    // Initialize evaluation interface
    class ExamEvaluation {
        constructor() {
            this.currentExam = null;
            this.currentSubmissionId = null;
            this.answers = [];
            this.currentQuestionIndex = 0;
            this.unsavedChanges = false;
            this.bindEvents();
        }

        bindEvents() {
            // Handle exam selection from sidebar
            $(document).on('click', '.exam-item', (e) => {
                e.preventDefault();
                const examId = $(e.currentTarget).data('exam-id');
                const submissionId = $(e.currentTarget).data('submission-id');
                this.loadExamSubmission(examId, submissionId);
            });

            // Track changes in mark inputs and feedback to detect unsaved changes
            $(document).on('change input', '.mark-select, .feedback-input', (e) => {
                this.unsavedChanges = true;
            });

            // Handle question navigation
            $(document).on('click', '.question-nav-btn', (e) => {
                const index = parseInt($(e.currentTarget).data('index'), 10);
                if (!isNaN(index)) {
                    // Check for unsaved changes before navigating
                    if (this.unsavedChanges) {
                        if (!confirm('You have unsaved changes. Do you want to continue without saving?')) {
                            return;
                        }
                    }
                    this.unsavedChanges = false;
                    this.showQuestion(index);
                } else {
                    console.error('Invalid question index in button data attribute');
                }
            });

            // Handle Save Score button
            $(document).on('click', '.save-score-btn:not(.disabled)', (e) => {
                e.preventDefault();
                const questionId = $(e.target).data('question-id');
                const mark = $(`.mark-select[data-question-id="${questionId}"]`).val();
                const feedback = $(`.feedback-input[data-question-id="${questionId}"]`).val();
                this.saveMark(questionId, mark, feedback);
            });
            
            // Handle Finish Evaluation button
            $(document).on('click', '#finish-evaluation-btn', (e) => {
                e.preventDefault();
                if (confirm('Are you sure you want to finish evaluation? This will mark the evaluation as complete.')) {
                    this.finishEvaluation();
                }
            });
        }

        // Generate dropdown options for marks from 0 to max_marks with 0.5 increments
        generateMarkOptions(maxMarks, selectedValue = 0) {
            let options = '';
            for (let i = 0; i <= maxMarks; i += 0.5) {
                const value = i.toFixed(1);
                const selected = parseFloat(selectedValue) === i ? 'selected' : '';
                options += `<option value="${value}" ${selected}>${value}</option>`;
            }
            return options;
        }

        loadExamSubmission(examId, submissionId) {
            // Check for unsaved changes before loading a new exam
            if (this.unsavedChanges) {
                if (!confirm('You have unsaved changes. Do you want to continue without saving?')) {
                    return;
                }
            }
            
            this.unsavedChanges = false;
            this.currentExam = examId;
            this.currentSubmissionId = submissionId;
            
            // Show loading state
            $('#evaluation-area').html('<div class="text-center p-5"><i class="bi bi-arrow-repeat"></i><br></div>');
            
            frappe.call({
                method: 'exampro.www.evaluate.get_submission_details',
                args: {
                    exam_id: examId,
                    submission_id: submissionId
                },
                callback: (r) => {
                    if (r.message && r.message.success) {
                        // Sort answers by sequence number
                        this.answers = r.message.answers.sort((a, b) => a.seq_no - b.seq_no);
                        
                        // Show question navigation
                        this.setupQuestionNavigation();
                        
                        // Show first question if answers exist
                        if (this.answers.length > 0) {
                            this.showQuestion(0);
                        }
                        
                        // Show question navigation panel
                        $('#question-nav-panel').show();
                        
                        // Check if all questions are evaluated to show/hide finish button
                        this.checkAllEvaluated();
                    }
                }
            });
        }

        setupQuestionNavigation() {
            const navGrid = $('#question-nav-buttons');
            navGrid.empty();
            
            this.answers.forEach((answer, index) => {
                const status = answer.evaluation_status;
                let btnClass = 'light';
                
                // Apply success class for evaluated questions
                if (status === 'Done') {
                    btnClass = 'success';
                } else if (status === 'Auto') {
                    btnClass = 'info';
                } else if (status === 'Pending') {
                    btnClass = 'warning';
                }
               
                // If question type is "Choices", mark it as disabled and use a different style
                const isChoicesType = answer.question_type === 'Choices';
                if (isChoicesType) {
                    btnClass = 'secondary';
                }
                
                const disabledAttr = isChoicesType ? 'disabled' : '';
                
                navGrid.append(`
                    <button class="question-nav-btn btn-sm btn-${btnClass}" data-index="${answer.seq_no}" ${disabledAttr}>
                    ${answer.seq_no}
                    </button>
                `);
            });
        }

        showQuestion(index) {
            // Validate index is a number
            const questionSeqNo = parseInt(index, 10);
            if (isNaN(questionSeqNo)) {
                console.error('Invalid question index:', index);
                return;
            }

            // Find the answer with the matching sequence number
            const answerIndex = this.answers.findIndex(answer => answer.seq_no === questionSeqNo);
            if (questionSeqNo <= 0) {
                return;
            }
            if (answerIndex === -1) {
                console.error('Question with sequence number not found:', questionSeqNo);
                return;
            }

            this.currentQuestionIndex = answerIndex;
            const answer = this.answers[answerIndex];
            
            if (!answer || !answer.question) {
                console.error('Invalid answer data for index:', answerIndex);
                return;
            }

            // Reset unsaved changes flag when loading a new question
            this.unsavedChanges = false;

            // Update navigation buttons
            $('.question-nav-btn').removeClass('active');
            $(`.question-nav-btn[data-index="${questionSeqNo}"]`).addClass('active');

            // Check if question is of type Choices (read-only) or if evaluation is not allowed (status is not Pending)
            const isChoicesType = answer.question_type === 'Choices';
            const isDone = answer.evaluation_status === 'Done' || answer.evaluation_status === 'Auto';
            const isPending = answer.evaluation_status === 'Pending';
            
            // Display read-only view for Choices type or auto-evaluated questions
            if (isChoicesType) {
                // Show simplified view for auto-evaluated questions
                $('#evaluation-area').html(`
                    <div class="card">
                        <div class="card-body">
                            <h5>Question ${questionSeqNo}</h5>
                            <div class="question-text mb-4">${answer.question}</div>
                            
                            <div class="answer-section mb-4">
                                <h6>Candidate's Answer:</h6>
                                <div class="p-3 bg-light rounded">${answer.answer || 'No answer provided'}</div>
                            </div>
                            
                            <div class="alert alert-secondary mt-3">
                                <i class="bi bi-info-circle me-2"></i>
                                This is a Choices type question that has been automatically evaluated.
                            </div>
                            
                            <div class="evaluation-result mt-3">
                                <strong>Score:</strong> ${answer.mark || 0} / ${answer.max_marks}
                            </div>
                        </div>
                    </div>
                `);
            } else if (isDone) {
                // Show evaluation interface for already evaluated questions with existing data
                const markOptions = this.generateMarkOptions(answer.max_marks, answer.mark || 0);
                $('#evaluation-area').html(`
                    <div class="card">
                        <div class="card-body">
                            <h5>Question ${questionSeqNo}</h5>
                            <div class="question-text mb-4">${answer.question}</div>
                            
                            <div class="answer-section mb-4">
                                <h6>Candidate's Answer:</h6>
                                <div class="p-3 bg-light rounded">${answer.answer || 'No answer provided'}</div>
                            </div>
                            
                            <div class="evaluation-section">
                                <h6>Evaluation</h6>
                                <div class="alert alert-success">
                                    <i class="bi bi-check-circle me-2"></i>
                                    This answer has been evaluated.
                                </div>
                                <div class="form-group mb-3">
                                    <label>Mark (max: ${answer.max_marks})</label>
                                    <select class="form-control mark-select" 
                                            data-question-id="${answer.exam_question}">
                                        ${markOptions}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Feedback (optional)</label>
                                    <textarea class="form-control feedback-input" 
                                              data-question-id="${answer.exam_question}"
                                              rows="3">${answer.evaluator_response || ''}</textarea>
                                </div>
                                <div class="mt-3">
                                    <button class="btn btn-primary save-score-btn" 
                                            data-question-id="${answer.exam_question}">
                                        Update Score
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            } else {
                // Show full evaluation interface for User Input pending questions
                const markOptions = this.generateMarkOptions(answer.max_marks, answer.mark || 0);
                $('#evaluation-area').html(`
                    <div class="card">
                        <div class="card-body">
                            <h5>Question ${questionSeqNo}</h5>
                            <div class="question-text mb-4">${answer.question}</div>
                            
                            <div class="answer-section mb-4">
                                <h6>Candidate's Answer:</h6>
                                <div class="p-3 bg-light rounded">${answer.answer || 'No answer provided'}</div>
                            </div>
                            
                            <div class="evaluation-section">
                                <h6>Evaluation</h6>
                                <div class="form-group mb-3">
                                    <label>Mark (max: ${answer.max_marks})</label>
                                    <select class="form-control mark-select" 
                                            data-question-id="${answer.exam_question}">
                                        ${markOptions}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Feedback (Optional)</label>
                                    <textarea class="form-control feedback-input" 
                                              data-question-id="${answer.exam_question}"
                                              rows="3">${answer.evaluator_response || ''}</textarea>
                                </div>
                                <div class="mt-3">
                                    <button class="btn btn-primary save-score-btn" 
                                            data-question-id="${answer.exam_question}">
                                        Save Score
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            }
        }

        saveMark(questionId, mark, feedback) {
            frappe.call({
                method: 'exampro.www.evaluate.save_marks',
                args: {
                    question_id: questionId,
                    marks: mark,  // Backend expects 'marks'
                    feedback: feedback,
                    submission_id: this.currentSubmissionId
                },
                callback: (r) => {
                    if (r.message && r.message.success) {
                        // Reset unsaved changes flag after successful save
                        this.unsavedChanges = false;
                        
                        // Update the answer in our local cache
                        const currentAnswer = this.answers[this.currentQuestionIndex];
                        if (currentAnswer && currentAnswer.exam_question === questionId) {
                            currentAnswer.mark = mark;
                            currentAnswer.evaluator_response = feedback;
                            currentAnswer.evaluation_status = 'Done';
                        }
                        
                        // Update navigation button status
                        $(`.question-nav-btn[data-index="${this.answers[this.currentQuestionIndex].seq_no}"]`)
                            .removeClass('btn-warning btn-light')
                            .addClass('btn-success');
                        
                        frappe.show_alert({
                            message: 'Mark saved successfully',
                            indicator: 'green'
                        });
                        
                        // Check if all questions are now evaluated
                        this.checkAllEvaluated();
                    }
                }
            });
        }
        
        // Check if all questions have been evaluated and show/hide Finish Evaluation button
        checkAllEvaluated() {
            if (!this.answers || this.answers.length === 0) {
                $('#finish-evaluation-btn').hide();
                return;
            }
            
            // Check if any question is still pending evaluation
            const pendingEvaluation = this.answers.some(answer => answer.evaluation_status === 'Pending');
            
            if (!pendingEvaluation) {
                // All questions evaluated, show the Finish Evaluation button
                $('#finish-evaluation-btn').show();
            } else {
                // Some questions still need evaluation, hide the button
                $('#finish-evaluation-btn').hide();
            }
        }
        
        // Finish the evaluation process
        finishEvaluation() {
            if (!this.currentSubmissionId) {
                frappe.show_alert({
                    message: 'No active submission to finish evaluation',
                    indicator: 'red'
                });
                return;
            }
            
            frappe.call({
                method: 'exampro.www.evaluate.finish_evaluation',
                args: {
                    submission_id: this.currentSubmissionId
                },
                callback: (r) => {
                    if (r.message && r.message.success) {
                        frappe.show_alert({
                            message: 'Evaluation marked as finished successfully',
                            indicator: 'green'
                        });
                        // Update the UI to reflect the finished state
                        $('#finish-evaluation-btn').hide().addClass('disabled');
                        
                        // Update exam item in sidebar
                        $(`.exam-item[data-submission-id="${this.currentSubmissionId}"]`)
                            .find('.exam-status')
                            .text('Finished');
                        window.location.reload(); // Reload to refresh the exam list
                    }
                },
                error: (err) => {
                    frappe.show_alert({
                        message: err.message || 'Error finishing evaluation',
                        indicator: 'red'
                    });
                }
            });
        }
    }

    // Initialize evaluation interface when document is ready
    new ExamEvaluation();
});