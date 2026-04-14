import { useState } from "react";
import { useGetUsers, useUpdateUserBalance, getGetUsersQueryKey } from "@workspace/api-client-react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Minus, SearchX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format } from "date-fns";

const balanceSchema = z.object({
  amount: z.coerce.number().positive().min(1, "Amount must be at least 1"),
  operation: z.enum(["add", "subtract", "set"])
});

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Debounce search
  useState(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const { data: users, isLoading } = useGetUsers({ 
    search: debouncedSearch || undefined,
    sortBy: "balance",
    order: "desc"
  }, { query: { queryKey: getGetUsersQueryKey({ search: debouncedSearch || undefined, sortBy: "balance", order: "desc" }) } });

  const updateBalance = useUpdateUserBalance();

  const form = useForm<z.infer<typeof balanceSchema>>({
    resolver: zodResolver(balanceSchema),
    defaultValues: {
      amount: 100,
      operation: "add"
    }
  });

  const selectedUser = users?.find(u => u.discordId === selectedUserId);

  const onSubmitBalance = (data: z.infer<typeof balanceSchema>) => {
    if (!selectedUserId) return;
    
    updateBalance.mutate({
      userId: selectedUserId,
      data: {
        amount: data.amount,
        operation: data.operation
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Balance updated",
          description: `Successfully updated balance for ${selectedUser?.username}`,
        });
        queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
        setSelectedUserId(null);
        form.reset();
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.error || "Failed to update balance",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground mt-1">Manage Discord users and token balances.</p>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username or ID..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Discord ID</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Inventory Items</TableHead>
              <TableHead className="text-right">Joined</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                </TableRow>
              ))
            ) : users && users.length > 0 ? (
              users.map((user) => (
                <TableRow key={user.discordId} className="hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedUserId(user.discordId)}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">{user.discordId}</TableCell>
                  <TableCell className="text-right font-bold text-primary font-mono">
                    {user.balance.toLocaleString()} 🍀
                  </TableCell>
                  <TableCell className="text-right">{user.inventory.length}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {format(new Date(user.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={(e) => {
                      e.stopPropagation();
                      setSelectedUserId(user.discordId);
                    }}>
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <SearchX className="h-8 w-8 mb-2 opacity-50" />
                    <p>No users found matching your search.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedUserId} onOpenChange={(open) => !open && setSelectedUserId(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Manage Balance</DialogTitle>
            <DialogDescription>
              Update token balance for <span className="font-bold text-foreground">{selectedUser?.username}</span>.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="bg-muted p-4 rounded-lg flex justify-between items-center mb-4 border border-border">
              <span className="text-sm text-muted-foreground">Current Balance</span>
              <span className="text-xl font-bold text-primary tracking-tight">{selectedUser.balance.toLocaleString()} 🍀</span>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitBalance)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="operation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Operation</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select operation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="add">Add Tokens</SelectItem>
                          <SelectItem value="subtract">Subtract Tokens</SelectItem>
                          <SelectItem value="set">Set Exact Balance</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end pt-4 space-x-2">
                <Button variant="outline" type="button" onClick={() => setSelectedUserId(null)}>Cancel</Button>
                <Button type="submit" disabled={updateBalance.isPending}>
                  {updateBalance.isPending ? "Updating..." : "Update Balance"}
                </Button>
              </div>
            </form>
          </Form>

          {selectedUser && selectedUser.inventory.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <h4 className="text-sm font-medium mb-3">Inventory Items</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {selectedUser.inventory.map(item => (
                  <div key={item.id} className="text-sm flex justify-between bg-card border border-border p-2 rounded">
                    <span>{item.name}</span>
                    <span className="text-muted-foreground text-xs">{format(new Date(item.acquiredAt), "MMM d, yyyy")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
