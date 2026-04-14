import { useState } from "react";
import { useGetOrders, useUpdateOrderStatus, getGetOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = statusFilter !== "all" ? { status: statusFilter as any } : undefined;
  
  const { data: orders, isLoading } = useGetOrders(queryParams, {
    query: { queryKey: getGetOrdersQueryKey(queryParams) }
  });

  const updateStatus = useUpdateOrderStatus();

  const handleStatusChange = (orderId: number, newStatus: string) => {
    updateStatus.mutate({
      orderId,
      data: { status: newStatus as any }
    }, {
      onSuccess: () => {
        toast({
          title: "Order Updated",
          description: `Order #${orderId} status changed to ${newStatus}`,
        });
        queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.error || "Failed to update order status",
          variant: "destructive"
        });
      }
    });
  };

  const StatusBadge = ({ status }: { status: string }) => {
    switch(status) {
      case "completed":
        return <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>;
      case "cancelled":
        return <Badge variant="destructive" className="bg-destructive/15 text-destructive hover:bg-destructive/25 border-destructive/20"><XCircle className="w-3 h-3 mr-1" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Orders</h1>
          <p className="text-muted-foreground mt-1">Manage shop requests and fulfillment.</p>
        </div>

        <div className="w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-24">Order ID</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Item / Service</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[180px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-9 w-32" /></TableCell>
                </TableRow>
              ))
            ) : orders && orders.length > 0 ? (
              orders.map((order) => (
                <TableRow key={order.id} className="hover:bg-muted/50">
                  <TableCell className="font-mono text-muted-foreground">#{order.id}</TableCell>
                  <TableCell className="font-medium">{order.username}</TableCell>
                  <TableCell>{order.itemLabel}</TableCell>
                  <TableCell className="text-right font-bold text-primary font-mono">
                    {order.price.toLocaleString()} 🍀
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(order.createdAt), "MMM d, h:mm a")}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>
                    <Select 
                      defaultValue={order.status} 
                      onValueChange={(val) => handleStatusChange(order.id, val)}
                      disabled={updateStatus.isPending}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Mark Pending</SelectItem>
                        <SelectItem value="completed">Mark Completed</SelectItem>
                        <SelectItem value="cancelled">Cancel Order</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <Inbox className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-lg font-medium">No orders found</p>
                    <p className="text-sm">There are no orders matching your current filter.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
