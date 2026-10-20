-- A night is no longer confirmed or called off by its count. `confirmed`
-- meant only that, so those nights go back to plain scheduled; a night the
-- old verdict called off stays `canceled`, because it was.
ALTER TABLE `game` DROP COLUMN `confirmed_at`;--> statement-breakpoint
UPDATE `game` SET `status` = 'scheduled' WHERE `status` = 'confirmed';--> statement-breakpoint
-- "Night confirmed" is gone as a topic. "On or off" is now only an admin's
-- cancellation, the part of it that is left, so a choice made for it stays.
DELETE FROM `notify_pref` WHERE `topic` = 'confirmed';--> statement-breakpoint
UPDATE `notify_pref` SET `topic` = 'canceled' WHERE `topic` = 'final';
