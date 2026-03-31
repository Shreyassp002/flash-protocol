'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ApiKeySection from '@/components/dashboard/settings/ApiKeySection'
import StealthSettings from '@/components/dashboard/settings/StealthSettings'
import WebhookSettings from '@/components/dashboard/settings/WebhookSettings'
import { Separator } from '@/components/ui/separator'
import { Key, Webhook } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account settings and API integrations.
        </p>
      </div>
      
      <Separator className="my-6" />
      
      <div className="grid gap-6">
        <StealthSettings />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Developer Settings
            </CardTitle>
            <CardDescription>
              Configure API keys to integrate payment links programmatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeySection merchantId="" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5" />
              Webhooks
            </CardTitle>
            <CardDescription>
              Receive real-time notifications when payment events occur.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WebhookSettings />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
