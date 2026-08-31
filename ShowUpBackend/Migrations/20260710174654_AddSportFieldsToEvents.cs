using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShowUpBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddSportFieldsToEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Sport",
                table: "Events",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SportDetails",
                table: "Events",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Sport",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "SportDetails",
                table: "Events");
        }
    }
}
