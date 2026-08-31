using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IJoinRequestService
{
    Task<(JoinRequestResponse? Response, string? Error, int StatusCode)> CreateAsync(
        Guid eventId, CreateJoinRequestRequest request);

    Task<(JoinRequestResponse? Response, string? Error, int StatusCode)> WithdrawAsync(
        Guid eventId, Guid requestId, WithdrawJoinRequestRequest request);

    Task<(JoinRequestResponse? Response, string? Error, int StatusCode)> AcceptAsync(
        Guid eventId, Guid requestId, AcceptJoinRequestRequest request);

    Task<(JoinRequestResponse? Response, string? Error, int StatusCode)> DeclineAsync(
        Guid eventId, Guid requestId, DeclineJoinRequestRequest request);

    Task<(List<JoinRequestSlotGroupDto>? Groups, string? Error, int StatusCode)> GetByEventAsync(
        Guid eventId, Guid callerId);
}
