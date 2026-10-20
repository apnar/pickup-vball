CREATE TABLE `notify_pref` (
	`user_id` text NOT NULL,
	`topic` text NOT NULL,
	`channel` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `topic`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `phone_check` (
	`user_id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sends` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL,
	`last_sent_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sms_in` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`from_phone` text NOT NULL,
	`text` text NOT NULL,
	`outcome` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sms_in_user_idx` ON `sms_in` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sms_out` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game_id` text,
	`send_id` text,
	`kind` text NOT NULL,
	`to_phone` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`send_after` integer NOT NULL,
	`telnyx_id` text,
	`error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`send_id`) REFERENCES `email_send`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sms_out_queue_idx` ON `sms_out` (`status`,`send_after`);--> statement-breakpoint
CREATE INDEX `sms_out_user_idx` ON `sms_out` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sms_out_telnyx_idx` ON `sms_out` (`telnyx_id`);--> statement-breakpoint
CREATE INDEX `sms_out_send_idx` ON `sms_out` (`send_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `user` ADD `phone_verified_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `sms_opted_out_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `email_blocked_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `email_blocked_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_uidx` ON `user` (`phone`);--> statement-breakpoint
ALTER TABLE `email_send` ADD `text_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `game` ADD `reminder_at` integer;--> statement-breakpoint
ALTER TABLE `game` ADD `spot_open_at` integer;