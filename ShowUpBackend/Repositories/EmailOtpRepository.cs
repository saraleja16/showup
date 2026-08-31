using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;

namespace ShowUpBackend.Repositories;

public class EmailOtpRepository : IEmailOtpRepository
{
    private readonly AppDbContext _context;

    public EmailOtpRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task AddAsync(EmailOtp otp)
    {
        await _context.EmailOtps.AddAsync(otp);
        await _context.SaveChangesAsync();
    }

    public async Task<EmailOtp?> GetLatestActiveAsync(string email, string purpose)
    {
        return await _context.EmailOtps
            .Where(o => o.Email == email && o.Purpose == purpose && o.ConsumedAt == null)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync();
    }

    public async Task<int> CountSentSinceAsync(string email, string purpose, DateTime since)
    {
        return await _context.EmailOtps
            .CountAsync(o => o.Email == email && o.Purpose == purpose && o.CreatedAt >= since);
    }

    public async Task InvalidateOutstandingAsync(string email, string purpose)
    {
        var now = DateTime.UtcNow;

        await _context.EmailOtps
            .Where(o => o.Email == email && o.Purpose == purpose && o.ConsumedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(o => o.ConsumedAt, now));
    }

    public async Task UpdateAsync(EmailOtp otp)
    {
        _context.EmailOtps.Update(otp);
        await _context.SaveChangesAsync();
    }
}
