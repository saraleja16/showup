using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShowUpBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddParticipationStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Status",
                table: "EventParticipants",
                type: "text",
                nullable: false,
                defaultValue: "Registered",
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<DateTime>(
                name: "StatusUpdatedAt",
                table: "EventParticipants",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "EventParticipants"
                SET "Status" = 'Registered'
                WHERE "Status" NOT IN ('Registered','Attended','NoShow','CancelledEarly','CancelledLate');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "StatusUpdatedAt",
                table: "EventParticipants");

            migrationBuilder.AlterColumn<string>(
                name: "Status",
                table: "EventParticipants",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text",
                oldDefaultValue: "Registered");
        }
    }
}
