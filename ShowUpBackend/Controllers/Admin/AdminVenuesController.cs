using Microsoft.AspNetCore.Mvc;
using ShowUpBackend.Filters;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers.Admin;

[ApiController]
[Route("api/admin/venues")]
[ServiceFilter(typeof(AdminKeyFilter))]
public class AdminVenuesController : ControllerBase
{
    private readonly IVenueService _venueService;

    public AdminVenuesController(IVenueService venueService)
    {
        _venueService = venueService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var venues = await _venueService.GetAllAsync();
        return Ok(venues);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var venue = await _venueService.GetByIdAsync(id);
        if (venue is null) return NotFound(new { message = "Venue not found" });
        return Ok(venue);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateVenueRequest request)
    {
        var (created, error, statusCode) = await _venueService.CreateAsync(request);
        if (created is null)
            return StatusCode(statusCode, new { message = error });
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateVenueRequest request)
    {
        var (updated, error, statusCode) = await _venueService.UpdateAsync(id, request);
        if (updated is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(updated);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        // Deleting a venue sets Events.VenueId to NULL (SET NULL FK) — no events are removed.
        var (success, error, statusCode) = await _venueService.DeleteAsync(id);
        if (!success)
            return StatusCode(statusCode, new { message = error });
        return NoContent();
    }
}
