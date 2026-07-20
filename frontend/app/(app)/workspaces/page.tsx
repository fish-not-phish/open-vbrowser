"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/store/AuthContext";
import { workspacesApi, type Workspace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Plus, Users, Settings, ChevronRight, Layers, Crown, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function WorkspacesPage() {
  const { user } = useAuthContext();
  const router = useRouter();
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newSlug, setNewSlug] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (user.isLoggedIn) load();
  }, [user.isLoggedIn]);

  async function load() {
    try {
      const data = await workspacesApi.list();
      setWorkspaces(data);
    } catch {
      toast.error("Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!user.csrfToken || !newName || !newSlug) return;
    setSaving(true);
    try {
      const ws = await workspacesApi.create({ name: newName, slug: newSlug }, user.csrfToken);
      setWorkspaces((prev) => [...prev, ws]);
      setCreating(false);
      setNewName(""); setNewSlug("");
      toast.success("Workspace created");
    } catch (e: any) {
      toast.error(e?.message?.includes("409") ? "Slug already in use" : "Failed to create workspace");
    } finally {
      setSaving(false);
    }
  }

  const nonPersonal = workspaces.filter((w) => !w.is_personal);
  const personal = workspaces.find((w) => w.is_personal);

  if (!user.isLoggedIn) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workspaces</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Collaborate and organise sessions with your team.</p>
        </div>
        {user.canCreateWorkspaces && (
          <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> New Workspace
          </Button>
        )}
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="space-y-3">
          {nonPersonal.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                <Layers className="size-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">No workspaces yet</p>
              {user.canCreateWorkspaces && (
                <Button size="sm" variant="outline" onClick={() => setCreating(true)}>Create your first workspace</Button>
              )}
            </div>
          )}
          {nonPersonal.map((ws, i) => (
            <motion.div
              key={ws.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="group rounded-xl border bg-card p-4 flex items-center gap-4 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Globe className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{ws.name}</span>
                  {ws.role === 'owner' && (
                    <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 h-4">
                      <Crown className="size-2.5" /> Owner
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="size-3" /> {ws.member_count} member{ws.member_count !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-muted-foreground">/{ws.slug}</span>
                  <span className="text-xs text-muted-foreground">Created {format(new Date(ws.created_at), "MMM d, yyyy")}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" asChild>
                  <Link href={`/workspaces/${ws.slug}/members`}><Users className="size-3.5" />Members</Link>
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" asChild>
                  <Link href={`/workspaces/${ws.slug}/settings`}><Settings className="size-3.5" />Settings</Link>
                </Button>
              </div>
              <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
            </motion.div>
          ))}

          {personal && (
            <div className="rounded-xl border border-dashed bg-muted/20 p-4 flex items-center gap-4">
              <div className="size-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Users className="size-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{personal.name}</span>
                <p className="text-xs text-muted-foreground mt-0.5">Your personal workspace</p>
              </div>
              <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" asChild>
                <Link href={`/workspaces/${personal.slug}/settings`}><Settings className="size-3.5" />Settings</Link>
              </Button>
            </div>
          )}
        </motion.div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Workspace</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="My Team" value={newName} onChange={(e) => {
                setNewName(e.target.value);
                setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
              }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} disabled={!newName || !newSlug || saving}>{saving ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
