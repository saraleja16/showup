namespace ShowUpBackend.Configuration;

public class EventLifecycleOptions
{
    public const string SectionName = "EventLifecycle";

    /// <summary>Minutes before start when status becomes StartingSoon.</summary>
    public int StartingSoonMinutes { get; set; } = 15;
}
