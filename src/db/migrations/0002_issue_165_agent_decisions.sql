CREATE TABLE `reviewer_claims` (
	`id` varchar(36) NOT NULL,
	`submission_id` varchar(255) NOT NULL,
	`revision_id` varchar(36) NOT NULL,
	`revision_number` int NOT NULL,
	`reviewer_id` varchar(36) NOT NULL,
	`reviewer_role` varchar(50) NOT NULL,
	`state` varchar(50) NOT NULL,
	`active_submission_id` varchar(255),
	`claimed_submission_version` int NOT NULL,
	`claimed_at` timestamp NOT NULL,
	`released_at` timestamp,
	`released_by` varchar(36),
	`released_by_role` varchar(50),
	`release_reason` text,
	`decided_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reviewer_claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `reviewer_claims_active_submission_idx` UNIQUE(`active_submission_id`)
);
--> statement-breakpoint
CREATE TABLE `agent_decisions` (
	`id` varchar(36) NOT NULL,
	`submission_id` varchar(255) NOT NULL,
	`revision_id` varchar(36) NOT NULL,
	`revision_number` int NOT NULL,
	`claim_id` varchar(36) NOT NULL,
	`reviewer_id` varchar(36) NOT NULL,
	`reviewer_role` varchar(50) NOT NULL,
	`decision_type` varchar(50) NOT NULL,
	`prior_status` varchar(50) NOT NULL,
	`resulting_status` varchar(50) NOT NULL,
	`rationale` text NOT NULL,
	`submission_version_before` int NOT NULL,
	`submission_version_after` int NOT NULL,
	`idempotency_record_key` varchar(255) NOT NULL,
	`recorded_at` timestamp NOT NULL,
	CONSTRAINT `agent_decisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_decisions_revision_idx` UNIQUE(`revision_id`),
	CONSTRAINT `agent_decisions_claim_idx` UNIQUE(`claim_id`),
	CONSTRAINT `agent_decisions_idempotency_record_key_idx` UNIQUE(`idempotency_record_key`)
);
--> statement-breakpoint
ALTER TABLE `reviewer_claims` ADD CONSTRAINT `reviewer_claims_submission_id_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviewer_claims` ADD CONSTRAINT `reviewer_claims_revision_id_submission_revisions_id_fk` FOREIGN KEY (`revision_id`) REFERENCES `submission_revisions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviewer_claims` ADD CONSTRAINT `reviewer_claims_reviewer_id_users_id_fk` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviewer_claims` ADD CONSTRAINT `reviewer_claims_active_submission_id_submissions_id_fk` FOREIGN KEY (`active_submission_id`) REFERENCES `submissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviewer_claims` ADD CONSTRAINT `reviewer_claims_released_by_users_id_fk` FOREIGN KEY (`released_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_decisions` ADD CONSTRAINT `agent_decisions_submission_id_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_decisions` ADD CONSTRAINT `agent_decisions_revision_id_submission_revisions_id_fk` FOREIGN KEY (`revision_id`) REFERENCES `submission_revisions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_decisions` ADD CONSTRAINT `agent_decisions_claim_id_reviewer_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `reviewer_claims`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_decisions` ADD CONSTRAINT `agent_decisions_reviewer_id_users_id_fk` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER prevent_reviewer_claims_closed_update
BEFORE UPDATE ON reviewer_claims
FOR EACH ROW
BEGIN
    IF OLD.state <> 'active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Closed reviewer claim rows are immutable.';
    END IF;
END;
--> statement-breakpoint
CREATE TRIGGER prevent_reviewer_claims_identity_update
BEFORE UPDATE ON reviewer_claims
FOR EACH ROW
BEGIN
    IF NOT (OLD.id <=> NEW.id)
        OR NOT (OLD.submission_id <=> NEW.submission_id)
        OR NOT (OLD.revision_id <=> NEW.revision_id)
        OR NOT (OLD.revision_number <=> NEW.revision_number)
        OR NOT (OLD.reviewer_id <=> NEW.reviewer_id)
        OR NOT (OLD.reviewer_role <=> NEW.reviewer_role)
        OR NOT (OLD.claimed_submission_version <=> NEW.claimed_submission_version)
        OR NOT (OLD.claimed_at <=> NEW.claimed_at)
        OR NOT (OLD.created_at <=> NEW.created_at) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer claim identity fields cannot be updated.';
    END IF;
    IF NEW.state = 'active' AND (
        NOT (OLD.active_submission_id <=> NEW.active_submission_id)
        OR NOT (OLD.released_at <=> NEW.released_at)
        OR NOT (OLD.released_by <=> NEW.released_by)
        OR NOT (OLD.released_by_role <=> NEW.released_by_role)
        OR NOT (OLD.release_reason <=> NEW.release_reason)
        OR NOT (OLD.decided_at <=> NEW.decided_at)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Active reviewer claims cannot be edited.';
    END IF;
END;
--> statement-breakpoint
CREATE TRIGGER prevent_reviewer_claims_delete
BEFORE DELETE ON reviewer_claims
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer claim rows cannot be deleted.';
END;
--> statement-breakpoint
CREATE TRIGGER prevent_agent_decisions_update
BEFORE UPDATE ON agent_decisions
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Agent decisions are immutable and cannot be updated.';
END;
--> statement-breakpoint
CREATE TRIGGER prevent_agent_decisions_delete
BEFORE DELETE ON agent_decisions
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Agent decisions are immutable and cannot be deleted.';
END;
