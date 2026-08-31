using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[ApiController]
[Route("api/venues")]
public class VenuesController : ControllerBase
{
    private readonly IVenueService _venueService;

    public VenuesController(IVenueService venueService)
    {
        _venueService = venueService;
    }

    /// <summary>
    /// Returns active venues. Optionally filter by sport (case-insensitive substring match against the venue's Sports field).
    /// This endpoint is public — no admin key required.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetActive([FromQuery] string? sport)
    {
        var venues = await _venueService.GetActiveAsync(sport);
        return Ok(venues);
    }
}
