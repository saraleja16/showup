using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IEventService
{
    Task<List<EventDto>> GetAllEventsAsync(Guid? userId = null);
    Task<List<EventDto>> SearchEventsAsync(EventSearchFilters filters, Guid userId);
    Task<EventDto?> GetEventByIdAsync(Guid id, Guid? userId = null);
    Task<(EventDto? Event, string? Error, int StatusCode)> CreateEventAsync(CreateEventRequest request);
    Task<(JoinEventResponse? Response, string? Error, int StatusCode)> JoinEventAsync(Guid eventId, JoinEventRequest request);
    Task<(LeaveEventResponse? Response, string? Error, int StatusCode)> LeaveEventAsync(Guid eventId, LeaveEventRequest request);
    Task<(AttendanceResponse? Response, string? Error, int StatusCode)> ConfirmAttendanceAsync(Guid eventId, AttendanceRequest request);
    Task<(CheckInResponse? Response, string? Error, int StatusCode)> CheckInAsync(Guid eventId, CheckInRequest request);
    Task<(ParticipantStatusResponse? Response, string? Error, int StatusCode)> GetParticipantStatusAsync(Guid eventId, Guid userId);
}
