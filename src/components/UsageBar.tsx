type UsageBarProps = {
    label: string;
    used: number;
    limit: number;
    upgradeLabel?: string;
};

export function UsageBar({ label, used, limit, upgradeLabel }: UsageBarProps) {
    const isUnlimited = limit === -1;
    const percentage = isUnlimited ? 0 : limit === 0 ? 100 : Math.min((used / limit) * 100, 100);
    const isWarning = percentage >= 80;
    const isCritical = percentage >= 100;

    return (
        <div className="usage-bar-container">
            <div className="usage-bar-header">
                <span>{label}</span>
                <span>{used}/{isUnlimited ? "Unlimited" : limit}</span>
            </div>
            <div className="usage-bar-track">
                <div
                    className={`usage-bar-fill ${isCritical ? "critical" : isWarning ? "warning" : ""}`}
                    style={{ width: `${isUnlimited ? 10 : percentage}%` }}
                />
            </div>
            {isCritical && upgradeLabel && (
                <p className="usage-bar-upgrade">Upgrade for more {upgradeLabel}</p>
            )}
        </div>
    );
}
