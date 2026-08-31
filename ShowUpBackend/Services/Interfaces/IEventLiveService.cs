using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IEventLiveService
{
    Task<(LiveEventResponse? Response, string? Error, int StatusCode)> GetLiveAsync(
        Guid eventId,
        Guid? viewerUserId = null);
    Task<(ManualAttendanceResponse? Response, string? Error, int StatusCode)> HostManualAttendanceAsync(
        Guid eventId, ManualAttendanceRequest request);
    Task<(ManualAttendanceResponse? Response, string? Error, int StatusCode)> ConfirmParticipantAttendanceAsync(
        Guid eventId,
        Guid targetUserId,
        Guid confirmerUserId);
}
