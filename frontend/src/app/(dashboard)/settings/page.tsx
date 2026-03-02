'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  User,
  Bell,
  Shield,
  CreditCard,
  Trash2,
  Loader2,
  CheckCircle2,
  Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiKeysSection } from '@/components/settings/api-keys';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  githubConnected: boolean;
  createdAt: string;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'billing'>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
  });

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'profile' || tab === 'security' || tab === 'notifications' || tab === 'billing') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('auth-token');
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setProfile(data.data);
          setFormData({
            name: data.data.name || '',
            email: data.data.email || '',
          });
        }
      } catch {
        // Ignore and keep fallback profile.
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, []);

  const mockProfile: UserProfile = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    avatarUrl: null,
    githubConnected: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
  };

  const displayProfile = profile || mockProfile;

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth-token');
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
    } finally {
      setSaving(false);
    }
  };

  const notifyUnavailable = (feature: string) => {
    toast.info(`${feature} is not wired to backend yet.`);
  };

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'billing' as const, label: 'Billing', icon: CreditCard },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="stagger-in">
        <h1 className="text-3xl font-semibold mono-text-gradient">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, security posture, and platform preferences.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-72 premium-panel p-3 h-fit">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 space-y-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="premium-panel p-6">
                <h3 className="font-semibold mb-4">Profile Picture</h3>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-foreground/10 border border-foreground/20 flex items-center justify-center">
                    <span className="text-2xl font-bold">{displayProfile.name?.charAt(0) || 'U'}</span>
                  </div>
                  <div>
                    <Button variant="outline" size="sm" onClick={() => notifyUnavailable('Avatar upload')}>
                      Change Photo
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">JPG, PNG or GIF. Max 2MB.</p>
                  </div>
                </div>
              </div>

              <div className="premium-panel p-6 space-y-4">
                <h3 className="font-semibold">Basic Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name || displayProfile.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Your name"
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || displayProfile.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="your@email.com"
                    className="h-11 rounded-xl"
                  />
                </div>

                <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>

              <div className="premium-panel p-6">
                <h3 className="font-semibold mb-4">Connected Accounts</h3>
                <div className="premium-panel p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Github className="h-6 w-6" />
                    <div>
                      <p className="font-medium">GitHub</p>
                      <p className="text-sm text-muted-foreground">
                        {displayProfile.githubConnected ? 'Connected' : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  {displayProfile.githubConnected ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">Connected</span>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/github`;
                      }}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="premium-panel p-6 space-y-4">
                <h3 className="font-semibold">Change Password</h3>
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input id="current-password" type="password" placeholder="••••••••" className="h-11 rounded-xl" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input id="new-password" type="password" placeholder="••••••••" className="h-11 rounded-xl" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input id="confirm-password" type="password" placeholder="••••••••" className="h-11 rounded-xl" />
                </div>

                <Button className="rounded-xl" onClick={() => notifyUnavailable('Password update')}>
                  Update Password
                </Button>
              </div>

              <ApiKeysSection />

              <div className="premium-panel p-6 border border-destructive/30">
                <h3 className="font-semibold mb-2">Danger Zone</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Once you delete your account, all projects and deployment history are permanently removed.
                </p>
                <Button
                  variant="destructive"
                  className="gap-2 rounded-xl"
                  onClick={() => notifyUnavailable('Account deletion')}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Account
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="premium-panel p-6 space-y-4">
              <h3 className="font-semibold">Email Notifications</h3>

              {[
                { id: 'deployments', label: 'Deployment Updates', description: 'Get notified when deployments succeed or fail' },
                { id: 'security', label: 'Security Alerts', description: 'Receive alerts about security-related events' },
                { id: 'billing', label: 'Billing Updates', description: 'Get notified about billing and usage' },
                { id: 'newsletter', label: 'Product Updates', description: 'Stay informed about new features and updates' },
              ].map((item) => (
                <div key={item.id} className="premium-panel p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <input
                    type="checkbox"
                    defaultChecked={item.id !== 'newsletter'}
                    onChange={() => toast.success(`Updated "${item.label}" preference.`)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div className="premium-panel p-6">
                <h3 className="font-semibold mb-4">Current Plan</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-semibold">Free</p>
                    <p className="text-sm text-muted-foreground">Best for local testing and development.</p>
                  </div>
                  <Button className="rounded-xl" onClick={() => notifyUnavailable('Billing upgrades')}>
                    Upgrade to Pro
                  </Button>
                </div>
              </div>

              <div className="premium-panel p-6 space-y-4">
                <h3 className="font-semibold">Usage This Month</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Build Minutes', used: 450, total: 500 },
                    { label: 'Bandwidth', used: 80, total: 100, unit: 'GB' },
                    { label: 'Serverless Functions', used: 100000, total: 125000, unit: 'invocations' },
                  ].map((item) => {
                    const percent = (item.used / item.total) * 100;
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>{item.label}</span>
                          <span className="text-muted-foreground">
                            {item.used.toLocaleString()} / {item.total.toLocaleString()} {item.unit || ''}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              percent > 90 ? 'bg-foreground/95' : percent > 70 ? 'bg-foreground/75' : 'bg-foreground/55'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="premium-panel p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Payment Methods</h3>
                  <Button variant="outline" size="sm" onClick={() => notifyUnavailable('Payment methods')}>
                    Add Card
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">No payment methods on file.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
