CREATE TABLE `accounts` (
	`id` varchar(36) NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`expires_at` timestamp,
	`password` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`key` varchar(255) NOT NULL,
	`request_hash` varchar(64) NOT NULL,
	`response_payload` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `idempotency_records_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `machine_analysis_snapshots` (
	`id` varchar(36) NOT NULL,
	`revision_id` varchar(36) NOT NULL,
	`analysis_run_id` varchar(36) NOT NULL,
	`sequence` int NOT NULL,
	`panel_runs` text NOT NULL,
	`categories` text NOT NULL,
	`readiness` varchar(50) NOT NULL,
	`recorded_at` timestamp NOT NULL,
	CONSTRAINT `machine_analysis_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seller_evidence_snapshots` (
	`id` varchar(36) NOT NULL,
	`revision_id` varchar(36) NOT NULL,
	`category_id` varchar(100) NOT NULL,
	`decision` varchar(50) NOT NULL,
	`expected_value` text,
	`regions` text NOT NULL,
	CONSTRAINT `seller_evidence_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(36) NOT NULL,
	`token` varchar(255) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `token_idx` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `submission_revisions` (
	`id` varchar(36) NOT NULL,
	`submission_id` varchar(255) NOT NULL,
	`revision_number` int NOT NULL,
	`profile_id` varchar(100) NOT NULL,
	`profile_version` varchar(50) NOT NULL,
	`submitted_by` varchar(255) NOT NULL,
	`submitted_at` timestamp NOT NULL,
	`canonical_json` text NOT NULL,
	`integrity_signature` varchar(255) NOT NULL,
	CONSTRAINT `submission_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sub_revision_idx` UNIQUE(`submission_id`,`revision_number`)
);
--> statement-breakpoint
CREATE TABLE `submission_status_events` (
	`id` varchar(36) NOT NULL,
	`submission_id` varchar(255) NOT NULL,
	`status` varchar(50) NOT NULL,
	`actor_id` varchar(36),
	`actor_role` varchar(50) NOT NULL,
	`reason_comment` text,
	`recorded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `submission_status_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` varchar(255) NOT NULL,
	`creator_id` varchar(36) NOT NULL,
	`current_status` varchar(50) NOT NULL,
	`is_demo` boolean NOT NULL DEFAULT false,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submitted_panels` (
	`id` varchar(36) NOT NULL,
	`revision_id` varchar(36) NOT NULL,
	`role` varchar(50) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`media_type` varchar(100) NOT NULL,
	`byte_size` int NOT NULL,
	`checksum_sha256` varchar(64) NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`rotation` int NOT NULL,
	`storage_key` varchar(500) NOT NULL,
	CONSTRAINT `submitted_panels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`name` text,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`role` varchar(50) NOT NULL DEFAULT 'seller',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` varchar(36) NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `machine_analysis_snapshots` ADD CONSTRAINT `machine_analysis_snapshots_revision_id_fk` FOREIGN KEY (`revision_id`) REFERENCES `submission_revisions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_evidence_snapshots` ADD CONSTRAINT `seller_evidence_snapshots_revision_id_fk` FOREIGN KEY (`revision_id`) REFERENCES `submission_revisions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_revisions` ADD CONSTRAINT `submission_revisions_submission_id_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_status_events` ADD CONSTRAINT `submission_status_events_submission_id_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_status_events` ADD CONSTRAINT `submission_status_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_creator_id_users_id_fk` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submitted_panels` ADD CONSTRAINT `submitted_panels_revision_id_fk` FOREIGN KEY (`revision_id`) REFERENCES `submission_revisions`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER prevent_submissions_update
BEFORE UPDATE ON submissions
FOR EACH ROW
BEGIN
    IF OLD.creator_id <> NEW.creator_id OR OLD.id <> NEW.id OR OLD.is_demo <> NEW.is_demo OR OLD.created_at <> NEW.created_at THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable fields on submissions cannot be updated.';
    END IF;
END;
--> statement-breakpoint
CREATE TRIGGER prevent_submissions_delete
BEFORE DELETE ON submissions
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submissions are immutable and cannot be deleted.';
END;
--> statement-breakpoint
CREATE TRIGGER prevent_revisions_update
BEFORE UPDATE ON submission_revisions
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revisions are immutable and cannot be updated.';
END;
--> statement-breakpoint
CREATE TRIGGER prevent_revisions_delete
BEFORE DELETE ON submission_revisions
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revisions are immutable and cannot be deleted.';
END;