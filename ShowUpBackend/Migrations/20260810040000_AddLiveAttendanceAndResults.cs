using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShowUpBackend.Data;

#nullable disable

namespace ShowUpBackend.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20260810040000_AddLiveAttendanceAndResults")]
    public partial class AddLiveAttendanceAndResults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "VerificationMethod",
                table: "EventParticipants",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "VerifiedByUserId",
                table: "EventParticipants",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "DistanceMeters",
                table: "EventParticipants",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ResultPromptSentAt",
                table: "Events",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EventResults",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sport = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ScoreJson = table.Column<string>(type: "jsonb", nullable: false),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SubmittedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamptz", nullable: false),
                    ConfirmedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConfirmedAt = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    DisputedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    DisputedAt = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    SideALabel = table.Column<string>(type: "text", nullable: true),
                    SideBLabel = table.Column<string>(type: "text", nullable: true),
                    ScoreA = table.Column<int>(type: "integer", nullable: true),
                    ScoreB = table.Column<int>(type: "integer", nullable: true),
                    UnitsWonA = table.Column<int>(type: "integer", nullable: true),
                    UnitsWonB = table.Column<int>(type: "integer", nullable: true),
                    Summary = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventResults_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EventResults_EventId",
                table: "EventResults",
                column: "EventId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "EventResults");

            migrationBuilder.DropColumn(name: "VerificationMethod", table: "EventParticipants");
            migrationBuilder.DropColumn(name: "VerifiedByUserId", table: "EventParticipants");
            migrationBuilder.DropColumn(name: "DistanceMeters", table: "EventParticipants");
            migrationBuilder.DropColumn(name: "ResultPromptSentAt", table: "Events");
        }
    }
}
