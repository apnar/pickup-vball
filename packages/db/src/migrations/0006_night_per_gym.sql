DROP INDEX `game_date_time_uidx`;--> statement-breakpoint
CREATE UNIQUE INDEX `game_gym_date_time_uidx` ON `game` (`gym_id`,`date`,`start_time`);