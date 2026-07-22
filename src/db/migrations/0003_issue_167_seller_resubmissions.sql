CREATE TABLE `submission_revision_responses` (
	`id` varchar(36) NOT NULL,
	`submission_id` varchar(255) NOT NULL,
	`parent_revision_id` varchar(36) NOT NULL,
	`parent_revision_number` int NOT NULL,
	`responded_to_decision_id` varchar(36) NOT NULL,
	`child_revision_id` varchar(36) NOT NULL,
	`child_revision_number` int NOT NULL,
	`seller_id` varchar(36) NOT NULL,
	`idempotency_record_key` varchar(255) NOT NULL,
	`recorded_at` timestamp NOT NULL,
	CONSTRAINT `submission_revision_responses_id` PRIMARY KEY(`id`),
	CONSTRAINT `submission_revision_responses_child_revision_idx` UNIQUE(`child_revision_id`),
	CONSTRAINT `submission_revision_responses_decision_idx` UNIQUE(`responded_to_decision_id`),
	CONSTRAINT `submission_revision_responses_idempotency_record_key_idx` UNIQUE(`idempotency_record_key`)
);
--> statement-breakpoint
ALTER TABLE `submission_revision_responses` ADD CONSTRAINT `srr_submission_fk` FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_revision_responses` ADD CONSTRAINT `srr_parent_revision_fk` FOREIGN KEY (`parent_revision_id`) REFERENCES `submission_revisions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_revision_responses` ADD CONSTRAINT `srr_decision_fk` FOREIGN KEY (`responded_to_decision_id`) REFERENCES `agent_decisions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_revision_responses` ADD CONSTRAINT `srr_child_revision_fk` FOREIGN KEY (`child_revision_id`) REFERENCES `submission_revisions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_revision_responses` ADD CONSTRAINT `srr_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER prevent_submission_revision_responses_update
BEFORE UPDATE ON submission_revision_responses
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revision response rows are immutable and cannot be updated.';
END;
--> statement-breakpoint
CREATE TRIGGER prevent_submission_revision_responses_delete
BEFORE DELETE ON submission_revision_responses
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revision response rows are immutable and cannot be deleted.';
END;
