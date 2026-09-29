import { Module } from "@nestjs/common";
import { UpdatesController } from "./updates.controller";

/**
 * OTA updates — serves the Expo Updates protocol manifest from the published
 * bundle files on the `updates` volume. Stateless (no DB, no guards): the
 * endpoint must be reachable before the user is authenticated, and the
 * manifest only ever describes the app's own published JS bundle.
 */
@Module({
  controllers: [UpdatesController],
})
export class UpdatesModule {}
