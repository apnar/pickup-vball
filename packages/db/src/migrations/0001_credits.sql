CREATE TABLE `check_in` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`walk_in` integer DEFAULT false NOT NULL,
	`checked_in_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`checked_in_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `check_in_game_user_uidx` ON `check_in` (`game_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `credit_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`game_id` text,
	`method` text,
	`amount_usd` integer,
	`note` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `credit_entry_user_idx` ON `credit_entry` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `credit_entry_created_idx` ON `credit_entry` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_entry_played_uidx` ON `credit_entry` (`game_id`,`user_id`) WHERE "credit_entry"."reason" = 'played';--> statement-breakpoint
CREATE UNIQUE INDEX `credit_entry_refund_uidx` ON `credit_entry` (`game_id`,`user_id`) WHERE "credit_entry"."reason" = 'refund';--> statement-breakpoint
ALTER TABLE `game` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `game` ADD `closed_by` text REFERENCES user(id) ON DELETE set null;