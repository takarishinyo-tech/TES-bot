import { useGetShopItems, getGetShopItemsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Package, Brush } from "lucide-react";

export default function ShopPage() {
  const { data: items, isLoading } = useGetShopItems({
    query: { queryKey: getGetShopItemsQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Shop Catalog</h1>
        <p className="text-muted-foreground mt-1">View available items and services in the bot economy.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex flex-col h-full">
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="flex-1">
                <Skeleton className="h-20 w-full" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          ))
        ) : items && items.length > 0 ? (
          items.map((item) => (
            <Card key={item.id} className="flex flex-col h-full overflow-hidden border-border/60 hover:border-primary/50 transition-colors">
              <CardHeader className="bg-muted/30 pb-4 border-b border-border/50">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{item.label}</CardTitle>
                    <CardDescription className="flex items-center gap-1.5 mt-1">
                      {item.type === "item" ? (
                        <Badge variant="outline" className="bg-background text-xs"><Package className="w-3 h-3 mr-1" /> Inventory Item</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs"><Brush className="w-3 h-3 mr-1" /> Service</Badge>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 flex-1">
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </CardContent>
              <CardFooter className="bg-muted/10 border-t border-border/50 pt-4">
                <div className="w-full flex justify-between items-center">
                  <span className="text-sm text-muted-foreground font-medium">Price</span>
                  <span className="text-xl font-bold text-primary font-mono">
                    {item.price.toLocaleString()} 🍀
                  </span>
                </div>
              </CardFooter>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium mb-1">No Shop Items</h3>
            <p className="text-sm">The shop catalog is currently empty.</p>
          </div>
        )}
      </div>
    </div>
  );
}
