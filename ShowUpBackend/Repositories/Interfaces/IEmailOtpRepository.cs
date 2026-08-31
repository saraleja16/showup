using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Repositories.Interfaces;

public interface IEmailOtpRepository
{
    Task AddAsync(EmailOtp otp);

    /// <summary>Most recent code for this email + purpose that has not been consumed yet.</summary>
    Task<EmailOtp?> GetLatestActiveAsync(string email, string purpose);

    /// <summary>Number of codes issued to this email since <paramref name="since"/> — used for rate limiting.</summary>
    Task<int> CountSentSinceAsync(string email, string purpose, DateTime since);

    /// <summary>Marks every outstanding code for this email + purpose as consumed, so only the newest one works.</summary>
    Task InvalidateOutstandingAsync(string email, string purpose);

    Task UpdateAsync(EmailOtp otp);
}
