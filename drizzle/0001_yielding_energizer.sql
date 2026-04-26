CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer,
	`inviter_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_inv_org` ON `invitations` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_inv_email` ON `invitations` (`email`);--> statement-breakpoint
DROP INDEX "idx_appr_exp";--> statement-breakpoint
DROP INDEX "idx_audit_org";--> statement-breakpoint
DROP INDEX "idx_audit_entity";--> statement-breakpoint
DROP INDEX "idx_audit_actor";--> statement-breakpoint
DROP INDEX "idx_budgets_org";--> statement-breakpoint
DROP INDEX "uq_budget_year_scope";--> statement-breakpoint
DROP INDEX "idx_attach_exp";--> statement-breakpoint
DROP INDEX "uq_attach_key";--> statement-breakpoint
DROP INDEX "idx_exp_org_status";--> statement-breakpoint
DROP INDEX "idx_exp_group_status";--> statement-breakpoint
DROP INDEX "idx_exp_user";--> statement-breakpoint
DROP INDEX "idx_exp_year";--> statement-breakpoint
DROP INDEX "idx_exp_date";--> statement-breakpoint
DROP INDEX "idx_gm_group";--> statement-breakpoint
DROP INDEX "idx_gm_user";--> statement-breakpoint
DROP INDEX "uq_gm_user_group";--> statement-breakpoint
DROP INDEX "idx_groups_org";--> statement-breakpoint
DROP INDEX "uq_group_org_code";--> statement-breakpoint
DROP INDEX "idx_inv_org";--> statement-breakpoint
DROP INDEX "idx_inv_email";--> statement-breakpoint
DROP INDEX "idx_mem_org";--> statement-breakpoint
DROP INDEX "idx_mem_user";--> statement-breakpoint
DROP INDEX "uq_mem_user_org";--> statement-breakpoint
DROP INDEX "uq_org_slug";--> statement-breakpoint
DROP INDEX "uq_users_email";--> statement-breakpoint
ALTER TABLE `users` ALTER COLUMN "name" TO "name" text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `idx_appr_exp` ON `approval_logs` (`expense_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_org` ON `audit_logs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_budgets_org` ON `budgets` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_budget_year_scope` ON `budgets` (`organization_id`,`group_id`,`fiscal_year`);--> statement-breakpoint
CREATE INDEX `idx_attach_exp` ON `expense_attachments` (`expense_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attach_key` ON `expense_attachments` (`r2_object_key`);--> statement-breakpoint
CREATE INDEX `idx_exp_org_status` ON `expenses` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_exp_group_status` ON `expenses` (`group_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_exp_user` ON `expenses` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_exp_year` ON `expenses` (`fiscal_year`);--> statement-breakpoint
CREATE INDEX `idx_exp_date` ON `expenses` (`date`);--> statement-breakpoint
CREATE INDEX `idx_gm_group` ON `group_memberships` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_gm_user` ON `group_memberships` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_gm_user_group` ON `group_memberships` (`user_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `idx_groups_org` ON `groups` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_group_org_code` ON `groups` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_mem_org` ON `memberships` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_user_org` ON `memberships` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_org_slug` ON `organizations` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `active_organization_id` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `logo` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `metadata` text;