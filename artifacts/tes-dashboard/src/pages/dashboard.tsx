import { useGetBotStatus, useGetBotStats, useGetShopActivity, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Coins, ShoppingCart, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function formatUptime(seconds: number | null) {
  if (seconds === null) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

export default function Dashboard() {
  const { data: botStatus, isLoading: isLoadingStatus } = useGetBotStatus({
    query: {
      queryKey: getGetBotStatusQueryKey(),
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  });

  const { data: botStats, isLoading: isLoadingStats } = useGetBotStats();
  const { data: activity, isLoading: isLoadingActivity } = useGetShopActivity();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">Live status and statistics for TES! bot.</p>
        </div>
        
        {/* Status Indicator */}
        <Card className="bg-card border-border shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            {isLoadingStatus ? (
              <Skeleton className="h-10 w-32" />
            ) : botStatus ? (
              <>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      {botStatus.online && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${botStatus.online ? 'bg-primary' : 'bg-destructive'}`}></span>
                    </span>
                    <span className="font-semibold">{botStatus.tag || "Unknown"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground mt-0.5">Prefix: {botStatus.prefix}</span>
                </div>
                <div className="h-8 w-px bg-border mx-2"></div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Uptime</span>
                  <span className="font-medium font-mono text-sm">{formatUptime(botStatus.uptime)}</span>
                </div>
              </>
            ) : (
              <span className="text-destructive font-medium">Failed to load status</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{botStats?.totalUsers.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens in Circulation</CardTitle>
            <Coins className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-primary flex items-center gap-1">
                🍀 {botStats?.totalTokensInCirculation.toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{botStats?.totalOrders.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{botStats?.pendingOrders.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Activity */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {isLoadingActivity ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))
              ) : activity && activity.length > 0 ? (
                activity.slice(0, 8).map((event) => (
                  <div key={event.id} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold border border-border">
                      {event.username.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">
                        <span className="font-semibold text-foreground">{event.username}</span>
                        {" "}
                        <span className="text-muted-foreground">{event.description}</span>
                        {event.amount && (
                          <span className="font-medium text-primary ml-1">
                            {event.amount > 0 ? "+" : ""}{event.amount} 🍀
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No recent activity found.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Balances */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Top Balances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoadingStats ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))
              ) : botStats?.topBalances && botStats.topBalances.length > 0 ? (
                botStats.topBalances.map((user, i) => (
                  <div key={user.userId} className="flex items-center justify-between p-3 rounded-lg bg-accent/50 border border-border/50">
                    <div className="flex items-center gap-3">
                      <div className="text-muted-foreground text-sm w-4 text-center font-mono">#{i + 1}</div>
                      <div className="font-medium">{user.username}</div>
                    </div>
                    <div className="font-bold text-primary font-mono tracking-tight">
                      {user.balance.toLocaleString()} 🍀
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No users found.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
