using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[ApiController]
[Authorize]
[Route("api/ai")]
public class AiController : ControllerBase
{
    private readonly IAiSearchService _aiSearchService;
    private readonly IEventService _eventService;
    private readonly IVenueService _venueService;
    private readonly IGeocodingService _geocodingService;

    public AiController(
        IAiSearchService aiSearchService,
        IEventService eventService,
        IVenueService venueService,
        IGeocodingService geocodingService)
    {
        _aiSearchService = aiSearchService;
        _eventService = eventService;
        _venueService = venueService;
        _geocodingService = geocodingService;
    }

    /// <summary>
    /// Natural-language search. AI/NL only produces filters; geocoding + Event/Venue services
    /// query real database rows. Explicit place names override the caller's location.
    /// </summary>
    [HttpPost("search-events")]
    public async Task<IActionResult> SearchEvents(
        [FromBody] AiSearchEventsRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        if (request is null || string.IsNullOrWhiteSpace(request.Query))
            return BadRequest(new { message = "Query is required." });

        var query = request.Query.Trim();
        if (query.Length > 500)
            return BadRequest(new { message = "Query must be at most 500 characters." });

        var (filters, error) = await _aiSearchService.ParseEventSearchQueryAsync(query, cancellationToken);
        if (filters is null)
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = error ?? "AI search is currently unavailable." });

        if (!string.IsNullOrWhiteSpace(filters.LocationQuery))
        {
            var geo = await _geocodingService.GeocodeAsync(filters.LocationQuery, cancellationToken);
            if (geo is null)
                return BadRequest(new { message = "Location could not be found." });

            filters.ResolvedLocation = new ResolvedLocationDto
            {
                Name = geo.Name,
                Latitude = geo.Latitude,
                Longitude = geo.Longitude
            };
            filters.PreferGeoOverTextLocation = true;

            // Place search always needs a radius around the resolved point.
            filters.RadiusKm ??= NaturalLanguageEventSearchParser.DefaultPlaceRadiusKm;
        }

        var response = new AiSearchEventsResponse
        {
            InterpretedFilters = EventSearchFilterValidator.ToInterpretedDto(filters)
        };

        if (AiSearchIntentTypes.IsVenueLike(filters.IntentType))
        {
            if (filters.ResolvedLocation is null)
                return BadRequest(new { message = "A location is required for venue search." });

            response.Venues = await _venueService.SearchNearbyAsync(
                filters.Sport,
                filters.ResolvedLocation.Latitude,
                filters.ResolvedLocation.Longitude,
                filters.RadiusKm ?? NaturalLanguageEventSearchParser.DefaultPlaceRadiusKm);
        }
        else
        {
            response.Events = await _eventService.SearchEventsAsync(filters, userId.Value);
        }

        return Ok(response);
    }
}
