import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  MapPin,
  Package,
  Phone,
  QrCode,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PriceText } from '../shared/components/data-display/PriceText';
import { Modal } from '../shared/components/feedback/Modal';
import { useToast } from '../shared/components/feedback/ToastProvider';
import { FormField } from '../shared/components/forms/FormField';
import { TextInput } from '../shared/components/forms/TextInput';
import { BrandLogo } from '../shared/components/ui/BrandLogo';
import { Button } from '../shared/components/ui/Button';
import { Card } from '../shared/components/ui/Card';
import { ROUTES } from '../shared/config/routes';
import { useBootstrapConfig } from '../shared/hooks/useBootstrapConfig';

export function PortalHubPage() {
  const { data: config } = useBootstrapConfig();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState({
    storeName: '',
    ownerName: '',
    phone: '',
    city: '',
    counters: '1-2 counters',
  });
  const [partnerSubmitted, setPartnerSubmitted] = useState(false);

  const defaultSlug = config?.seededStoreSlug || 'sri-lakshmi-smartkottu';

  const handlePartnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerForm.storeName.trim() || !partnerForm.ownerName.trim() || !partnerForm.phone.trim()) {
      showToast({ tone: 'error', message: 'Please fill in store name, your name, and phone number.' });
      return;
    }
    setPartnerSubmitted(true);
    showToast({
      tone: 'success',
      message: 'Partnership request received! Our onboarding team will contact you within 2 hours.',
    });
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col text-ink-primary selection:bg-accent-soft selection:text-accent-primary">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-surface-card/95 backdrop-blur-md border-b border-border-default/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center cursor-pointer text-left focus:outline-none"
          >
            <BrandLogo size="md" />
          </button>

          {/* Center Navigation Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-ink-secondary">
            <button
              type="button"
              onClick={() => scrollToSection('problems')}
              className="hover:text-ink-primary transition-colors cursor-pointer"
            >
              The Problem
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('channels')}
              className="hover:text-ink-primary transition-colors cursor-pointer"
            >
              Omnichannel Architecture
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              className="hover:text-ink-primary transition-colors cursor-pointer"
            >
              Owner Features
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Note: Owner sign in button converted into Admin sign in as requested */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(ROUTES.ADMIN_LOGIN)}
              className="text-xs font-semibold text-ink-muted hover:text-ink-primary"
            >
              <Lock className="h-3.5 w-3.5 mr-1 text-ink-muted" /> Admin Sign in
            </Button>

            {/* Store Owner Sign In */}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(ROUTES.OWNER_LOGIN)}
              className="text-xs font-semibold"
            >
              <Store className="h-3.5 w-3.5 mr-1 text-accent-primary" /> Store Sign in
            </Button>

            {/* Primary Sign Up CTA */}
            <Button
              size="sm"
              onClick={() => setPartnerModalOpen(true)}
              className="text-xs font-bold shadow-xs bg-accent-primary text-ink-inverse"
            >
              Partner With Us
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full space-y-20 md:space-y-28 pb-20">
        {/* ========================================================= */}
        {/* SECTION 1: HERO SECTION                                    */}
        {/* ========================================================= */}
        <section className="relative pt-10 md:pt-16 px-4 sm:px-6 max-w-7xl mx-auto">
          {/* Subtle Background Glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-accent-primary/5 rounded-full blur-3xl pointer-events-none -z-10" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-6 space-y-6 text-left">
              {/* Audience Pill */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-soft/80 border border-accent-primary/20 text-accent-primary text-xs font-bold tracking-wide">
                <Sparkles className="h-3.5 w-3.5" />
                <span>The Supermarket Operating System</span>
              </div>

              {/* Headline & Subheadline */}
              <div className="space-y-3">
                <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-ink-primary leading-[1.15]">
                  Welcome to <span className="text-accent-primary">Galli SmartKottu</span>
                </h1>
                <p className="font-display text-xl sm:text-2xl font-bold text-ink-secondary leading-snug">
                  Here you can manage, track, and improve with us.
                </p>
              </div>

              {/* Supporting Description */}
              <p className="text-sm sm:text-base text-ink-secondary leading-relaxed max-w-xl">
                Take complete control of your supermarket with one intelligent platform. Manage your sales, track
                finances, monitor inventory, organize staff, and serve customers online and offline — all from one place.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  size="lg"
                  onClick={() => setPartnerModalOpen(true)}
                  className="font-bold text-sm px-6 shadow-md bg-accent-primary text-ink-inverse"
                >
                  <span>Partner With Us</span>
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => scrollToSection('features')}
                  className="font-semibold text-sm px-5"
                >
                  Explore Features
                </Button>
              </div>

              {/* Already a partner hint */}
              <div className="text-xs text-ink-muted flex items-center gap-1.5">
                <span>Already running a store?</span>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.OWNER_LOGIN)}
                  className="font-semibold text-accent-primary hover:underline cursor-pointer"
                >
                  Sign in to Store Portal →
                </button>
              </div>

              {/* Trust Messaging */}
              <div className="pt-4 border-t border-border-default/80">
                <div className="text-xs font-semibold uppercase tracking-wider text-accent-primary mb-2.5">
                  Built for neighbourhood supermarkets. Designed for smarter business growth.
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-ink-secondary font-medium">
                  <div className="flex items-center gap-1.5 bg-surface-card px-2.5 py-1.5 rounded-lg border border-border-default shadow-2xs">
                    <Zap className="h-3.5 w-3.5 text-accent-primary shrink-0" /> Fast POS Billing
                  </div>
                  <div className="flex items-center gap-1.5 bg-surface-card px-2.5 py-1.5 rounded-lg border border-border-default shadow-2xs">
                    <QrCode className="h-3.5 w-3.5 text-accent-primary shrink-0" /> QR Storefront
                  </div>
                  <div className="flex items-center gap-1.5 bg-surface-card px-2.5 py-1.5 rounded-lg border border-border-default shadow-2xs">
                    <TrendingUp className="h-3.5 w-3.5 text-accent-primary shrink-0" /> Live P&L Margin
                  </div>
                  <div className="flex items-center gap-1.5 bg-surface-card px-2.5 py-1.5 rounded-lg border border-border-default shadow-2xs">
                    <ShieldCheck className="h-3.5 w-3.5 text-accent-primary shrink-0" /> Digital Khata
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Live Interactive Dashboard Mockup Preview */}
            <div className="lg:col-span-6">
              <div className="relative rounded-2xl border border-border-strong/80 bg-surface-card shadow-2xl p-4 sm:p-5 space-y-4">
                {/* Mockup Header Bar */}
                <div className="flex items-center justify-between pb-3 border-b border-border-default">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center font-bold text-xs">
                      GS
                    </div>
                    <div>
                      <div className="text-xs font-bold text-ink-primary truncate">Annapurna Smart Supermarket</div>
                      <div className="text-[10px] text-ink-muted">Indiranagar Branch · Live System</div>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-success-bg text-status-success-fg text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-success-fg animate-pulse" /> Live Synced
                  </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {/* Today's Sales */}
                  <div className="rounded-xl border border-border-default bg-surface-subtle/60 p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-ink-muted uppercase">Today's Sales</div>
                    <div className="text-base font-bold text-ink-primary">
                      <PriceText amountPaise={2485000} />
                    </div>
                    <div className="text-[10px] text-status-success-fg font-medium">↑ +18.4% · 42 orders</div>
                  </div>

                  {/* Total Revenue */}
                  <div className="rounded-xl border border-border-default bg-surface-subtle/60 p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-ink-muted uppercase">Total Revenue</div>
                    <div className="text-base font-bold text-ink-primary">
                      <PriceText amountPaise={41850000} />
                    </div>
                    <div className="text-[10px] text-ink-secondary">Month to date GMV</div>
                  </div>

                  {/* Profit Summary */}
                  <div className="rounded-xl border border-border-default bg-surface-subtle/60 p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-ink-muted uppercase">Profit Summary</div>
                    <div className="text-base font-bold text-accent-primary">
                      <PriceText amountPaise={6820000} />
                    </div>
                    <div className="text-[10px] text-accent-primary font-semibold">16.3% Net Margin</div>
                  </div>

                  {/* Inventory Overview */}
                  <div className="rounded-xl border border-border-default bg-surface-subtle/60 p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-ink-muted uppercase">Inventory Overview</div>
                    <div className="text-sm font-bold text-ink-primary">1,240 SKUs</div>
                    <div className="text-[10px] text-status-success-fg font-medium">98.4% Available</div>
                  </div>

                  {/* Pending Orders */}
                  <div className="rounded-xl border border-border-default bg-surface-subtle/60 p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-ink-muted uppercase">Pending Orders</div>
                    <div className="text-sm font-bold text-status-warning-fg">3 Online</div>
                    <div className="text-[10px] text-ink-secondary">2 Packing · 1 Out</div>
                  </div>

                  {/* Quick Action Pill */}
                  <div className="rounded-xl border border-dashed border-accent-primary/40 bg-accent-soft/30 p-3 flex flex-col justify-center items-center text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(ROUTES.OWNER_LOGIN)}
                      className="text-[11px] font-bold text-accent-primary h-auto py-1 px-2"
                    >
                      Open POS Bill →
                    </Button>
                    <span className="text-[9px] text-ink-muted">1-tap billing ready</span>
                  </div>
                </div>

                {/* Low-Stock Notifications Box */}
                <div className="rounded-xl border border-status-warning-fg/30 bg-status-warning-bg/60 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-status-warning-fg text-[11px]">
                    <span className="inline-flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> Low-Stock Notifications (2 alerts)
                    </span>
                    <span className="text-[10px] font-semibold underline cursor-pointer">Auto-PO ready</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-ink-primary">
                    <div className="flex items-center justify-between">
                      <span>• Aashirvaad Shudh Chakki Atta 5kg</span>
                      <span className="font-mono font-bold text-status-danger-fg">3 units left</span>
                    </div>
                    <div className="flex items-center justify-between text-ink-secondary">
                      <span>• Tata Iodized Salt 1kg</span>
                      <span className="font-mono font-bold text-status-warning-fg">6 units left</span>
                    </div>
                  </div>
                </div>

                {/* Live Activity Row */}
                <div className="pt-2 border-t border-border-default flex items-center justify-between text-[11px] text-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Last POS sale: 4 mins ago (₹640 · UPI)
                  </span>
                  <span className="font-semibold text-accent-primary">Unified Dashboard</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 2: THE PROBLEM WE SOLVE                            */}
        {/* ========================================================= */}
        <section id="problems" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-status-danger-bg text-status-danger-fg text-xs font-bold uppercase tracking-wider">
              The Problem
            </div>
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-ink-primary">
              Running a Supermarket Shouldn't Be This Complicated.
            </h2>
            <p className="text-sm text-ink-secondary">
              Traditional grocery retail becomes overwhelming when you are forced to run your business with fragmented,
              manual tools.
            </p>
          </div>

          {/* 4 Problem Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Card 1 */}
            <Card padding="lg" className="border-border-default hover:border-status-danger-fg/40 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-status-danger-bg text-status-danger-fg flex items-center justify-center font-bold text-base">
                01
              </div>
              <h3 className="text-base font-bold text-ink-primary">Financial Blindspots</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Manual financial calculations make it difficult to understand actual business performance.
              </p>
              <div className="text-xs text-ink-muted border-t border-border-default pt-2.5">
                End-of-day register balancing takes hours, profit margins are guessed rather than known, and cash leaks go
                undetected.
              </div>
            </Card>

            {/* Card 2 */}
            <Card padding="lg" className="border-border-default hover:border-status-danger-fg/40 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-status-danger-bg text-status-danger-fg flex items-center justify-center font-bold text-base">
                02
              </div>
              <h3 className="text-base font-bold text-ink-primary">Inventory Chaos & Wastage</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Poor inventory visibility causes stock shortages, overstocking, and product wastage.
              </p>
              <div className="text-xs text-ink-muted border-t border-border-default pt-2.5">
                Bestsellers run out of stock without warning, expired batches sit unnoticed on shelves, and valuable working
                capital is trapped in dead inventory.
              </div>
            </Card>

            {/* Card 3 */}
            <Card padding="lg" className="border-border-default hover:border-status-danger-fg/40 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-status-danger-bg text-status-danger-fg flex items-center justify-center font-bold text-base">
                03
              </div>
              <h3 className="text-base font-bold text-ink-primary">Messy Customer Credit</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Managing customer credit and pending payments manually becomes confusing.
              </p>
              <div className="text-xs text-ink-muted border-t border-border-default pt-2.5">
                Paper credit slips get torn or lost, awkward balance disputes occur at checkout, and delayed repayments squeeze
                your daily cash flow.
              </div>
            </Card>

            {/* Card 4 */}
            <Card padding="lg" className="border-border-default hover:border-status-danger-fg/40 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-status-danger-bg text-status-danger-fg flex items-center justify-center font-bold text-base">
                04
              </div>
              <h3 className="text-base font-bold text-ink-primary">Billing Counter Bottlenecks</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Staff coordination and crowded billing counters reduce operational efficiency.
              </p>
              <div className="text-xs text-ink-muted border-t border-border-default pt-2.5">
                Long peak-hour lines cause walkaways, staff struggle to recall unbarcoded prices, and phone delivery calls
                interrupt in-store checkout.
              </div>
            </Card>
          </div>

          {/* Closing Statement Callout */}
          <div className="rounded-2xl border border-accent-primary/30 bg-gradient-to-r from-accent-soft/80 to-surface-card p-6 md:p-8 text-center space-y-3">
            <h3 className="font-display text-xl md:text-2xl font-extrabold text-ink-primary">
              "Your business deserves more than notebooks, spreadsheets, and guesswork."
            </h3>
            <p className="text-sm text-ink-secondary max-w-xl mx-auto">
              Galli SmartKottu replaces chaos with automated inventory, real-time POS, digital customer storefronts, and
              crystal-clear financial intelligence.
            </p>
            <div className="pt-2">
              <Button size="md" onClick={() => setPartnerModalOpen(true)} className="font-bold">
                Partner With Us Today →
              </Button>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 3: ONE PLATFORM. TWO SALES CHANNELS               */}
        {/* ========================================================= */}
        <section id="channels" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-2.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft text-accent-primary text-xs font-bold uppercase tracking-wider">
              One Platform. Two Sales Channels.
            </div>
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-ink-primary">
              Never Lose a Customer Because Your Store Is Busy.
            </h2>
            <p className="text-sm text-ink-secondary">
              Whether your customer is standing in aisle 2 or sitting on their living room sofa, Galli SmartKottu connects both
              channels into a single real-time inventory and management dashboard.
            </p>
          </div>

          {/* Split-Screen Interactive Architecture Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* LEFT SIDE: Traditional In-Store Shopping */}
            <div className="lg:col-span-5 rounded-2xl border border-border-default bg-surface-card p-6 shadow-sm flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border-default">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-surface-subtle text-ink-primary flex items-center justify-center font-bold">
                      <Store className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">Channel 1</span>
                  </div>
                  <span className="text-xs font-bold text-ink-primary">Traditional In-Store</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-ink-primary">Physical In-Store Shopping</h3>
                  <p className="text-xs text-ink-secondary mt-1">
                    Serve walk-in shoppers with lightning-fast offline POS and barcode billing.
                  </p>
                </div>

                <ul className="space-y-3 text-sm text-ink-primary">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-accent-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block">Walk-in customers</strong>
                      <span className="text-xs text-ink-secondary">
                        Welcome local neighbourhood shoppers into your physical aisles.
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-accent-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block">Physical product browsing</strong>
                      <span className="text-xs text-ink-secondary">Shoppers touch, inspect, and select items directly off shelves.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-accent-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block">POS billing</strong>
                      <span className="text-xs text-ink-secondary">
                        Ultra-fast barcode scanning, weight scales, price overrides, and cash registers.
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-accent-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block">In-store purchases</strong>
                      <span className="text-xs text-ink-secondary">Instant handover with printed thermal receipts or SMS bills.</span>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl bg-surface-subtle p-3 text-xs text-ink-muted">
                Deducts shelf inventory in real-time instantly.
              </div>
            </div>

            {/* CENTER: Galli SmartKottu Platform Core */}
            <div className="lg:col-span-2 rounded-2xl border-2 border-accent-primary bg-accent-soft/40 p-5 flex flex-col justify-center items-center text-center space-y-4 shadow-md">
              <div className="w-12 h-12 rounded-2xl bg-accent-primary text-ink-inverse flex items-center justify-center shadow-lg">
                <Layers className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-ink-primary">Galli SmartKottu</div>
                <div className="text-[11px] font-semibold text-accent-primary uppercase tracking-wider">
                  Central Brain
                </div>
              </div>

              <div className="w-full space-y-2 text-[11px] text-ink-secondary">
                <div className="rounded-lg bg-surface-card p-2 border border-border-default shadow-2xs">
                  ⚡ <strong>Unified Stock</strong>
                  <br />No double-selling
                </div>
                <div className="rounded-lg bg-surface-card p-2 border border-border-default shadow-2xs">
                  📊 <strong>Single Ledger</strong>
                  <br />P&L & Day Closing
                </div>
                <div className="rounded-lg bg-surface-card p-2 border border-border-default shadow-2xs">
                  📒 <strong>Shared Khata</strong>
                  <br />Offline & Online
                </div>
              </div>
            </div>

            {/* RIGHT SIDE: Digital Storefront */}
            <div className="lg:col-span-5 rounded-2xl border border-border-default bg-surface-card p-6 shadow-sm flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border-default">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center font-bold">
                      <QrCode className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-accent-primary">Channel 2</span>
                  </div>
                  <span className="text-xs font-bold text-accent-primary">Digital Storefront</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-ink-primary">Digital Online Storefront</h3>
                  <p className="text-xs text-ink-secondary mt-1">
                    Let local customers order groceries on their phones for delivery or pickup.
                  </p>
                </div>

                <ul className="space-y-3 text-sm text-ink-primary">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-accent-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block">QR code scanning</strong>
                      <span className="text-xs text-ink-secondary">
                        Shoppers scan your store QR flyer at entrance or on WhatsApp to open store.
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-accent-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block">Digital product browsing</strong>
                      <span className="text-xs text-ink-secondary">
                        Customers view live photos, category filters, offers, and MRP discounts.
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-accent-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block">Online orders</strong>
                      <span className="text-xs text-ink-secondary">
                        Store portal alerts staff with packing lists and items breakdown.
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-accent-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block">Home delivery & Scheduled pickup</strong>
                      <span className="text-xs text-ink-secondary">
                        Deliver to doorstep within your km radius, or offer pre-packed counter pickup.
                      </span>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl bg-accent-soft/40 p-3 text-xs text-accent-primary font-medium">
                Shares the exact same inventory & prices seamlessly.
              </div>
            </div>
          </div>

          {/* Key Omnichannel Message Callout */}
          <div className="rounded-2xl border border-border-default bg-surface-card p-6 md:p-8 text-center space-y-2.5 shadow-sm">
            <h3 className="font-display text-lg sm:text-xl md:text-2xl font-bold text-ink-primary">
              "Serve offline and online customers simultaneously. Expand your reach without opening another physical store."
            </h3>
            <p className="text-xs sm:text-sm text-ink-secondary max-w-xl mx-auto">
              Your existing inventory, staff, and neighbourhood trust become your greatest digital advantage.
            </p>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 4: STORE OWNER FEATURES OVERVIEW                   */}
        {/* ========================================================= */}
        <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-subtle text-ink-secondary text-xs font-bold uppercase tracking-wider">
              Comprehensive Tools
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-primary">
              Everything Your Supermarket Needs
            </h2>
            <p className="text-xs sm:text-sm text-ink-secondary">
              Built specifically for the everyday workflows of grocery and supermarket operators.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Feature 1 */}
            <Card padding="md" className="space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-ink-primary">Offline POS Billing</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Billing never stops during broadband cuts. Transactions queue locally and synchronize automatically once
                reconnected.
              </p>
            </Card>

            {/* Feature 2 */}
            <Card padding="md" className="space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-ink-primary">Real-Time P&L & Day Closing</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Automated daily register closing checks cash in drawer, UPI reconciliation, vendor expenses, and net profit
                margins.
              </p>
            </Card>

            {/* Feature 3 */}
            <Card padding="md" className="space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center">
                <Package className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-ink-primary">Batch Expiry & Low Stock Alerts</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Never sell expired goods. Get automated notifications when milk, bread, or staples are close to shelf expiry or
                reorder levels.
              </p>
            </Card>

            {/* Feature 4 */}
            <Card padding="md" className="space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center">
                <QrCode className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-ink-primary">Customer Digital Khata</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Digitize regular customer credit slips with transaction histories, balance reminders, and direct UPI settlement
                links.
              </p>
            </Card>

            {/* Feature 5 */}
            <Card padding="md" className="space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-ink-primary">Staff Permissions & Shift Logs</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Give cashiers and packers safe access without exposing your wholesale margins, supplier costs, or owner financial
                settings.
              </p>
            </Card>

            {/* Feature 6 */}
            <Card padding="md" className="space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center">
                <Truck className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-ink-primary">Neighbourhood Delivery Engine</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Set your custom delivery radius (e.g. 3 km), minimum order amount, and delivery fees. Control your customer
                experience directly.
              </p>
            </Card>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 5: FINAL CTA & PARTNERSHIP SIGN UP                */}
        {/* ========================================================= */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="rounded-3xl border border-accent-primary/20 bg-gradient-to-br from-surface-card to-accent-soft/50 p-8 sm:p-12 text-center space-y-6 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-accent-primary text-ink-inverse mx-auto flex items-center justify-center shadow-md">
              <Store className="h-6 w-6" />
            </div>

            <div className="space-y-2 max-w-xl mx-auto">
              <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold text-ink-primary">
                Transform Your Supermarket Today
              </h2>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Join neighbourhood supermarket owners modernizing their sales, inventory, and customer relationships with
                Galli SmartKottu.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={() => setPartnerModalOpen(true)}
                className="font-bold text-sm px-8 shadow-md bg-accent-primary text-ink-inverse"
              >
                Partner With Us
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => navigate(ROUTES.OWNER_LOGIN)}
                className="font-semibold text-sm px-6"
              >
                Store Owner Sign in
              </Button>
            </div>

            <div className="pt-2 text-xs text-ink-muted">
              Zero hardware lock-in · Works on standard PC, Android tablet or phone · 2-minute assisted onboarding
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================= */}
      {/* FOOTER                                                    */}
      {/* ========================================================= */}
      <footer className="border-t border-border-default bg-surface-card py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-ink-muted">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <BrandLogo size="sm" />
            <span>Digital Supermarket Operating System for Neighbourhood Retail.</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-semibold text-ink-secondary">
            <button
              type="button"
              onClick={() => navigate(ROUTES.OWNER_LOGIN)}
              className="hover:text-ink-primary transition-colors cursor-pointer"
            >
              Store Owner Sign in
            </button>
            <button
              type="button"
              onClick={() => navigate(ROUTES.ADMIN_LOGIN)}
              className="hover:text-ink-primary transition-colors cursor-pointer"
            >
              Admin Sign in
            </button>
            {defaultSlug && (
              <button
                type="button"
                onClick={() => navigate(`/store/${defaultSlug}`)}
                className="hover:text-ink-primary transition-colors cursor-pointer text-accent-primary"
              >
                View Customer Storefront Demo →
              </button>
            )}
          </div>

          <div className="text-center md:text-right">
            © 2026 Galli SmartKottu. Built for neighbourhood retail growth.
          </div>
        </div>
      </footer>

      {/* ========================================================= */}
      {/* PARTNER WITH US / ONBOARDING MODAL                        */}
      {/* ========================================================= */}
      <Modal
        open={partnerModalOpen}
        onClose={() => {
          setPartnerModalOpen(false);
          setPartnerSubmitted(false);
        }}
        title="Partner With Galli SmartKottu"
        size="md"
      >
        {partnerSubmitted ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-status-success-bg text-status-success-fg mx-auto flex items-center justify-center font-bold">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-ink-primary">Thank you for your interest!</h3>
              <p className="text-xs text-ink-secondary max-w-sm mx-auto">
                We have received details for <strong>{partnerForm.storeName}</strong>. Our supermarket specialist will
                connect with you at <strong>{partnerForm.phone}</strong> to activate your digital store.
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPartnerModalOpen(false);
                  setPartnerSubmitted(false);
                }}
              >
                Close
              </Button>
              {defaultSlug && (
                <Button
                  size="sm"
                  onClick={() => {
                    setPartnerModalOpen(false);
                    navigate(`/store/${defaultSlug}`);
                  }}
                >
                  Explore Demo Storefront
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handlePartnerSubmit} className="space-y-3.5">
            <p className="text-xs text-ink-secondary">
              Fill in your supermarket details below to sign up and modernize your store operations with us.
            </p>

            <FormField label="Supermarket / Store Name" htmlFor="p-store-name" required>
              <TextInput
                id="p-store-name"
                placeholder="e.g. Sri Krishna Supermarket"
                value={partnerForm.storeName}
                onChange={(e) => setPartnerForm({ ...partnerForm, storeName: e.target.value })}
                required
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Owner / Manager Name" htmlFor="p-owner-name" required>
                <TextInput
                  id="p-owner-name"
                  placeholder="e.g. Ramesh Reddy"
                  value={partnerForm.ownerName}
                  onChange={(e) => setPartnerForm({ ...partnerForm, ownerName: e.target.value })}
                  required
                />
              </FormField>

              <FormField label="Mobile Phone Number" htmlFor="p-phone" required>
                <TextInput
                  id="p-phone"
                  placeholder="e.g. 9876543210"
                  value={partnerForm.phone}
                  onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })}
                  required
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="City / Locality" htmlFor="p-city">
                <TextInput
                  id="p-city"
                  placeholder="e.g. Hyderabad / Madhapur"
                  value={partnerForm.city}
                  onChange={(e) => setPartnerForm({ ...partnerForm, city: e.target.value })}
                />
              </FormField>

              <FormField label="Billing Counters" htmlFor="p-counters">
                <select
                  id="p-counters"
                  value={partnerForm.counters}
                  onChange={(e) => setPartnerForm({ ...partnerForm, counters: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-border-default bg-surface-card text-xs text-ink-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="1 counter">1 billing counter</option>
                  <option value="2-3 counters">2-3 billing counters</option>
                  <option value="4+ counters">4+ billing counters (Supermarket Chain)</option>
                </select>
              </FormField>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3 border-t border-border-default">
              <div className="text-[11px] text-ink-muted">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setPartnerModalOpen(false);
                    navigate(ROUTES.OWNER_LOGIN);
                  }}
                  className="font-bold text-accent-primary hover:underline cursor-pointer"
                >
                  Sign in here
                </button>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setPartnerModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Submit Request
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
