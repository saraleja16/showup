using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IEventResultService
{
    Task<(EventResultSummaryDto? Result, string? Error, int StatusCode)> GetAsync(Guid eventId);
    Task<(EventResultSummaryDto? Result, string? Error, int StatusCode)> SubmitAsync(
        Guid eventId, SubmitEventResultRequest request);
    Task<(EventResultSummaryDto? Result, string? Error, int StatusCode)> ConfirmAsync(
        Guid eventId, ConfirmEventResultRequest request);
    Task<(EventResultSummaryDto? Result, string? Error, int StatusCode)> DisputeAsync(
        Guid eventId, DisputeEventResultRequest request);
}
