using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Controllers;

[ApiController]
[Route("api/sports")]
public class SportsController : ControllerBase
{
    /// <summary>
    /// Returns the static position slot template for a sport/format combination.
    /// sportId: "soccer" | "tennis" | "pickleball" | "volleyball"
    /// format:  sport-specific — e.g. "5-a-side" for soccer, "singles"/"doubles" for tennis,
    ///          "2v2-beach"/"4v4"/"6v6" for volleyball (pickleball same as tennis).
    /// Returns an empty array when the format has no fixed formation (soccer "custom").
    /// No DB query — pure static formation data.
    /// </summary>
    [HttpGet("{sportId}/formations")]
    public IActionResult GetFormations(string sportId, [FromQuery] string format)
    {
        if (string.IsNullOrWhiteSpace(format))
            return BadRequest(new { message = "format query parameter is required" });

        var sport = SportCatalog.Get(sportId) as IHasFormations;
        if (sport is null)
            return NotFound(new { message = $"Sport '{sportId}' not found or does not support formations" });

        var slots = sport.GetFormationSlots(format);
        return Ok(slots);
    }
}
