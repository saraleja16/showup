using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[Authorize]
[ApiController]
[Route("api/events")]
public class EventsController : ControllerBase
{
    private readonly IEventService _eventService;
    private readonly IEventLiveService _liveService;
    private readonly IEventResultService _resultService;
    private readonly IPositionService _positionService;
    private readonly AttendanceOptions _attendanceOptions;

    public EventsController(
        IEventService eventService,
        IEventLiveService liveService,
        IEventResultService resultService,
        IPositionService positionService,
        IOptions<AttendanceOptions> attendanceOptions)
    {
        _eventService = eventService;
        _liveService = liveService;
        _resultService = resultService;
        _positionService = positionService;
        _attendanceOptions = attendanceOptions.Value;
    }

    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId = null)
    {
        var events = await _eventService.GetAllEventsAsync(userId);
        return Ok(events);
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, [FromQuery] Guid? userId = null)
    {
        var ev = await _eventService.GetEventByIdAsync(id, userId);
        if (ev is null) return NotFound();
        return Ok(ev);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEventRequest request)
    {
        var (created, error, statusCode) = await _eventService.CreateEventAsync(request);

        if (created is null)
        {
            return StatusCode(statusCode, new { message = error });
        }

        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPost("{id:guid}/join")]
    public async Task<IActionResult> Join(Guid id, [FromBody] JoinEventRequest request)
    {
        var (response, error, statusCode) = await _eventService.JoinEventAsync(id, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("{id:guid}/leave")]
    public async Task<IActionResult> Leave(Guid id, [FromBody] LeaveEventRequest request)
    {
        var (response, error, statusCode) = await _eventService.LeaveEventAsync(id, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("{id:guid}/attendance")]
    public async Task<IActionResult> ConfirmAttendance(Guid id, [FromBody] AttendanceRequest request)
    {
        var (response, error, statusCode) = await _eventService.ConfirmAttendanceAsync(id, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    /// <summary>Host manual attendance when GPS/auto check-in is unavailable.</summary>
    [HttpPost("{id:guid}/attendance/manual")]
    public async Task<IActionResult> HostManualAttendance(Guid id, [FromBody] ManualAttendanceRequest request)
    {
        var hostId = User.GetUserId() ?? request.HostUserId;
        request.HostUserId = hostId;
        var (response, error, statusCode) = await _liveService.HostManualAttendanceAsync(id, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    /// <summary>
    /// Host or already-Present participant confirms another pending participant.
    /// </summary>
    [HttpPost("{id:guid}/attendance/{userId:guid}/confirm")]
    public async Task<IActionResult> ConfirmParticipantAttendance(
        Guid id,
        Guid userId,
        [FromBody] ConfirmAttendanceRequest? request = null)
    {
        var confirmerId = User.GetUserId() ?? request?.ConfirmedByUserId;
        if (confirmerId is null || confirmerId == Guid.Empty)
            return Unauthorized(new { message = "Confirmer identity is required" });

        var (response, error, statusCode) = await _liveService.ConfirmParticipantAttendanceAsync(
            id, userId, confirmerId.Value);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}/live")]
    public async Task<IActionResult> GetLive(Guid id, [FromQuery] Guid? userId = null)
    {
        var viewerId = User.GetUserId() ?? userId;
        var (response, error, statusCode) = await _liveService.GetLiveAsync(id, viewerId);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}/results")]
    public async Task<IActionResult> GetResult(Guid id)
    {
        var (response, error, statusCode) = await _resultService.GetAsync(id);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("{id:guid}/results")]
    public async Task<IActionResult> SubmitResult(Guid id, [FromBody] SubmitEventResultRequest request)
    {
        var (response, error, statusCode) = await _resultService.SubmitAsync(id, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("{id:guid}/results/confirm")]
    public async Task<IActionResult> ConfirmResult(Guid id, [FromBody] ConfirmEventResultRequest request)
    {
        var (response, error, statusCode) = await _resultService.ConfirmAsync(id, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("{id:guid}/results/dispute")]
    public async Task<IActionResult> DisputeResult(Guid id, [FromBody] DisputeEventResultRequest request)
    {
        var (response, error, statusCode) = await _resultService.DisputeAsync(id, request);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    [HttpPost("{id:guid}/checkin")]
    [HttpPost("{id:guid}/attendance/check-in")]
    public async Task<IActionResult> CheckIn(Guid id, [FromBody] CheckInRequest request)
    {
        var authUserId = User.GetUserId();
        if (authUserId.HasValue)
            request.UserId = authUserId.Value;

        if (request.UserId == Guid.Empty)
            return Unauthorized(new { message = "User identity is required" });

        var (response, error, statusCode) = await _eventService.CheckInAsync(id, request);

        if (statusCode == 200)
            return Ok(response);

        // Too-far rejection: response is non-null and carries distanceMeters; error carries venueName.
        if (response is not null)
        {
            var radiusMeters = _attendanceOptions.CheckInRadiusMeters > 0
                ? _attendanceOptions.CheckInRadiusMeters : 200.0;
            return StatusCode(400, new
            {
                message = "Too far from venue",
                distanceMeters = response.DistanceMeters,
                radiusMeters,
                venueName = error
            });
        }

        return StatusCode(statusCode, new { message = error });
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}/participants/{userId:guid}")]
    public async Task<IActionResult> GetParticipantStatus(Guid id, Guid userId)
    {
        var (response, error, statusCode) = await _eventService.GetParticipantStatusAsync(id, userId);
        if (response is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(response);
    }

    // ── Position picker ──────────────────────────────────────────────────────

    [AllowAnonymous]
    [HttpGet("{id:guid}/positions")]
    public async Task<IActionResult> GetPositions(Guid id, [FromQuery] Guid? callerId = null)
    {
        var (slots, error, statusCode) = await _positionService.GetEventPositionsAsync(id, callerId);
        if (slots is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(slots);
    }

    [HttpPost("{id:guid}/positions/{slotId}/claim")]
    public async Task<IActionResult> ClaimPosition(Guid id, string slotId, [FromBody] ClaimPositionRequest request)
    {
        var (slot, error, statusCode) = await _positionService.ClaimAsync(id, slotId, request);
        if (slot is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(slot);
    }

    [HttpPost("{id:guid}/positions/{slotId}/release")]
    public async Task<IActionResult> ReleasePosition(Guid id, string slotId, [FromBody] ReleasePositionRequest request)
    {
        var (slot, error, statusCode) = await _positionService.ReleaseAsync(id, slotId, request);
        if (slot is null)
            return StatusCode(statusCode, new { message = error });
        return Ok(slot);
    }
}
