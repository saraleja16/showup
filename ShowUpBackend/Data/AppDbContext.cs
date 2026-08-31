using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<EventParticipant> EventParticipants => Set<EventParticipant>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Venue> Venues => Set<Venue>();
    public DbSet<EventPosition> EventPositions => Set<EventPosition>();
    public DbSet<MatchDecision> MatchDecisions => Set<MatchDecision>();
    public DbSet<Connection> Connections => Set<Connection>();
    public DbSet<UserBlock> UserBlocks => Set<UserBlock>();
    public DbSet<EventJoinRequest> EventJoinRequests => Set<EventJoinRequest>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<EventInvitation> EventInvitations => Set<EventInvitation>();
    public DbSet<EmailOtp> EmailOtps => Set<EmailOtp>();
    public DbSet<EventResult> EventResults => Set<EventResult>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.Username).IsUnique();
            entity.HasIndex(u => u.Email).IsUnique();
            entity.HasIndex(u => new { u.IsActive, u.IsPrivate });
            entity.HasIndex(u => new { u.Latitude, u.Longitude });
            entity.HasIndex(u => u.SkillLevel);
            entity.Property(u => u.IsActive).HasDefaultValue(true);
            entity.Property(u => u.IsPrivate).HasDefaultValue(false);
            entity.Property(u => u.IsEmailVerified).HasDefaultValue(false);
            entity.Property(u => u.EmailVerifiedAt).HasColumnType("timestamptz");
        });

        modelBuilder.Entity<EmailOtp>(entity =>
        {
            entity.HasKey(o => o.Id);

            entity.Property(o => o.Email).HasMaxLength(320).IsRequired();
            entity.Property(o => o.CodeHash).HasMaxLength(64).IsRequired();
            entity.Property(o => o.Purpose).HasMaxLength(64).IsRequired();
            entity.Property(o => o.ExpiresAt).HasColumnType("timestamptz");
            entity.Property(o => o.ConsumedAt).HasColumnType("timestamptz");
            entity.Property(o => o.CreatedAt).HasColumnType("timestamptz");
            entity.Property(o => o.AttemptCount).HasDefaultValue(0);

            entity.HasOne(o => o.User)
                .WithMany()
                .HasForeignKey(o => o.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Lookup path for verification: newest live code for an email + purpose.
            entity.HasIndex(o => new { o.Email, o.Purpose, o.ConsumedAt });
            // Supports the "how many codes did we send recently" rate-limit query.
            entity.HasIndex(o => new { o.Email, o.CreatedAt });
        });

        modelBuilder.Entity<EventParticipant>(entity =>
        {
            entity.HasKey(ep => ep.Id);

            entity.HasOne(ep => ep.Event)
                .WithMany()
                .HasForeignKey(ep => ep.EventId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ep => ep.User)
                .WithMany()
                .HasForeignKey(ep => ep.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(ep => new { ep.EventId, ep.UserId }).IsUnique();

            entity.Property(ep => ep.Status)
                .HasConversion<string>()
                .HasDefaultValue(ParticipationStatus.Registered);

            entity.Property(ep => ep.StatusUpdatedAt)
                .HasColumnType("timestamptz");

            entity.Property(ep => ep.VerificationMethod)
                .HasMaxLength(64);

            entity.Property(ep => ep.DistanceMeters);
        });

        
        modelBuilder.Entity<EventResult>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.HasIndex(r => r.EventId).IsUnique();
            entity.Property(r => r.Sport).HasMaxLength(64);
            entity.Property(r => r.Status).HasMaxLength(64);
            entity.Property(r => r.ScoreJson).HasColumnType("jsonb");
            entity.Property(r => r.Summary).HasMaxLength(500);
            entity.Property(r => r.SubmittedAt).HasColumnType("timestamptz");
            entity.Property(r => r.ConfirmedAt).HasColumnType("timestamptz");
            entity.Property(r => r.DisputedAt).HasColumnType("timestamptz");
            entity.HasOne(r => r.Event)
                .WithMany()
                .HasForeignKey(r => r.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(n => n.Id);
            entity.HasOne(n => n.User).WithMany().HasForeignKey(n => n.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(n => n.Event).WithMany().HasForeignKey(n => n.EventId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(n => n.UserId);
        });

        modelBuilder.Entity<Event>(entity =>
        {
            entity.Property(e => e.SportDetails).HasColumnType("jsonb");
            entity.Property(e => e.ReminderSentAt).HasColumnType("timestamptz");
            entity.Property(e => e.FinalizedAt).HasColumnType("timestamptz");
            entity.Property(e => e.ResultPromptSentAt).HasColumnType("timestamptz");
            entity.HasOne(e => e.Venue)
                .WithMany()
                .HasForeignKey(e => e.VenueId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<EventPosition>(entity =>
        {
            entity.HasKey(ep => ep.Id);

            entity.Property(ep => ep.Id)
                .HasDefaultValueSql("gen_random_uuid()");

            entity.Property(ep => ep.Status)
                .HasDefaultValue("open");

            entity.Property(ep => ep.ClaimedAt)
                .HasColumnType("timestamptz");

            entity.HasOne(ep => ep.Event)
                .WithMany()
                .HasForeignKey(ep => ep.EventId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ep => ep.ClaimedByUser)
                .WithMany()
                .HasForeignKey(ep => ep.ClaimedByUserId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(ep => new { ep.EventId, ep.SlotId }).IsUnique();
        });

        modelBuilder.Entity<MatchDecision>(entity =>
        {
            entity.HasKey(d => d.Id);

            entity.Property(d => d.Decision)
                .HasConversion<string>();

            entity.HasIndex(d => new { d.FromUserId, d.ToUserId }).IsUnique();
            entity.HasIndex(d => d.ToUserId);
            entity.HasIndex(d => new { d.FromUserId, d.Decision });

            entity.HasOne(d => d.FromUser)
                .WithMany()
                .HasForeignKey(d => d.FromUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(d => d.ToUser)
                .WithMany()
                .HasForeignKey(d => d.ToUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Connection>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.HasIndex(c => new { c.UserAId, c.UserBId }).IsUnique();
            entity.HasIndex(c => c.UserBId);

            entity.HasOne(c => c.UserA)
                .WithMany()
                .HasForeignKey(c => c.UserAId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(c => c.UserB)
                .WithMany()
                .HasForeignKey(c => c.UserBId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserBlock>(entity =>
        {
            entity.HasKey(b => b.Id);
            entity.HasIndex(b => new { b.BlockerUserId, b.BlockedUserId }).IsUnique();
            entity.HasIndex(b => b.BlockedUserId);

            entity.HasOne(b => b.BlockerUser)
                .WithMany()
                .HasForeignKey(b => b.BlockerUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(b => b.BlockedUser)
                .WithMany()
                .HasForeignKey(b => b.BlockedUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EventJoinRequest>(entity =>
        {
            entity.HasKey(r => r.Id);

            entity.HasOne(r => r.Event)
                .WithMany()
                .HasForeignKey(r => r.EventId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(r => r.Requester)
                .WithMany()
                .HasForeignKey(r => r.RequesterId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(r => r.Status)
                .HasDefaultValue("Pending");

            entity.HasIndex(r => new { r.EventId, r.Status });
            entity.HasIndex(r => new { r.RequesterId, r.Status });
        });

        modelBuilder.Entity<Message>(entity =>
        {
            entity.HasKey(m => m.Id);

            entity.HasOne(m => m.Connection)
                .WithMany()
                .HasForeignKey(m => m.ConnectionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(m => m.Sender)
                .WithMany()
                .HasForeignKey(m => m.SenderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(m => new { m.ConnectionId, m.CreatedAt });
            entity.HasIndex(m => m.SenderId);
        });

        modelBuilder.Entity<EventInvitation>(entity =>
        {
            entity.HasKey(i => i.Id);

            entity.HasOne(i => i.Event)
                .WithMany()
                .HasForeignKey(i => i.EventId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(i => i.Inviter)
                .WithMany()
                .HasForeignKey(i => i.InviterId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(i => i.Invitee)
                .WithMany()
                .HasForeignKey(i => i.InviteeId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(i => i.Status)
                .HasDefaultValue("Pending");

            entity.HasIndex(i => new { i.InviteeId, i.Status });
            entity.HasIndex(i => new { i.EventId, i.Status });
        });
    }
}
