using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IEventInvitationService
{
    Task<(EventInvitationDto? Invitation, string? Error, int StatusCode)> CreateAsync(
        Guid eventId, Guid inviterId, CreateEventInvitationRequest request, CancellationToken cancellationToken = default);

    Task<(EventInvitationDto? Invitation, string? Error, int StatusCode)> AcceptAsync(
        Guid eventId, Guid invitationId, Guid inviteeId, CancellationToken cancellationToken = default);

    Task<(EventInvitationDto? Invitation, string? Error, int StatusCode)> DeclineAsync(
        Guid eventId, Guid invitationId, Guid inviteeId, CancellationToken cancellationToken = default);

    /// <summary>All Pending invitations addressed to the given user, across all events.</summary>
    Task<(List<EventInvitationDto>? Invitations, string? Error, int StatusCode)> GetPendingForUserAsync(
        Guid userId, CancellationToken cancellationToken = default);
}
