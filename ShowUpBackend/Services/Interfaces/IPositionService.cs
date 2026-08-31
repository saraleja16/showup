using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IPositionService
{
    Task<(List<PositionSlotDto>? Slots, string? Error, int StatusCode)> GetEventPositionsAsync(Guid eventId, Guid? callerId = null);
    Task<(PositionSlotDto? Slot, string? Error, int StatusCode)> ClaimAsync(Guid eventId, string slotId, ClaimPositionRequest request);
    Task<(PositionSlotDto? Slot, string? Error, int StatusCode)> ReleaseAsync(Guid eventId, string slotId, ReleasePositionRequest request);
}
