CREATE TABLE `game_group` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`format` text DEFAULT '6v6' NOT NULL,
	`night_type` text DEFAULT 'coed' NOT NULL,
	`capacity` integer DEFAULT 42 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_group_name_unique` ON `game_group` (`name`);--> statement-breakpoint
CREATE TABLE `game_group_member` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `game_group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_group_member_uidx` ON `game_group_member` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `game_group_member_user_idx` ON `game_group_member` (`user_id`);--> statement-breakpoint
ALTER TABLE `game` ADD `group_id` text REFERENCES game_group(id) ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `game` ADD `night_type` text DEFAULT 'coed' NOT NULL;--> statement-breakpoint
CREATE INDEX `game_group_idx` ON `game` (`group_id`);--> statement-breakpoint
-- The groups the organizer named when groups were introduced. Their defaults
-- are a starting point an admin edits on /admin/groups; nobody is in any of
-- them yet, and admins see every night regardless.
INSERT INTO `game_group` (`id`, `name`, `format`, `night_type`, `capacity`) VALUES
	('grp-sunday-night', 'Sunday Night Volleyball', '6v6', 'coed', 42),
	('grp-revco-6v6', 'RevCo 6v6', '6v6', 'revco', 42),
	('grp-monday-random', 'Monday/Random Days', '6v6', 'coed', 42),
	('grp-saturday-revco', 'Saturday Night RevCo 6s', '6v6', 'revco', 42),
	('grp-advanced-random', 'Advanced Level Random Days', '6v6', 'coed', 42),
	('grp-sunday-afternoon', 'Sunday Afternoon Volleyball', '6v6', 'coed', 42);