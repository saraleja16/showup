using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShowUpBackend.Data;

#nullable disable

namespace ShowUpBackend.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20260807000000_AddEventCostAndRequiredSkill")]
    public partial class AddEventCostAndRequiredSkill : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "TotalCost",
                table: "Events",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RequiredSkillLevel",
                table: "Events",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TotalCost",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "RequiredSkillLevel",
                table: "Events");
        }
    }
}
