ALTER TABLE `game` ADD `format` text DEFAULT '6v6' NOT NULL;--> statement-breakpoint
ALTER TABLE `game` ADD `capacity` integer DEFAULT 42 NOT NULL;