using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShowUpBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddCheckInColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "FinalizedAt",
                table: "Events",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReminderSentAt",
                table: "Events",
                type: "timestamptz",
                nullable: true);

            // Backfill: mark every event that is already past T+15 as finalized so the
            // first hosted-service tick does not retroactively flip historical Registered
            // participants to NoShow and corrupt reliability scores.
            migrationBuilder.Sql("""
                UPDATE "Events"
                SET "FinalizedAt" = "ScheduledAt" + interval '15 minutes'
                WHERE "ScheduledAt" < now() - interval '15 minutes';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FinalizedAt",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "ReminderSentAt",
                table: "Events");
        }
    }
}
