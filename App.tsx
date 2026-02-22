import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Reviews } from './components/Reviews';
import { HowItWorks } from './components/HowItWorks';
import { Comparison } from './components/Comparison';
import { Calculator } from './components/Calculator';
import { Features } from './components/Features';
import { Pricing } from './components/Pricing';
import { Footer } from './components/Footer';
import { Modal } from './components/ui/Modal';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { Auth } from './components/Auth';
import { Handelsbetingelser } from './components/pages/Handelsbetingelser';
import { Privatlivspolitik } from './components/pages/Privatlivspolitik';
import { Databehandleraftale } from './components/pages/Databehandleraftale';
import { AboutUs } from './components/pages/AboutUs';
import { ContactUs } from './components/pages/ContactUs';
import { EkstraOmsaetning } from './components/pages/EkstraOmsaetning';
import { Tilfredshedsgaranti } from './components/pages/Tilfredshedsgaranti';
import { ResetPassword } from './components/pages/ResetPassword';
import { trackEvent } from './services/telemetry';

type EntitlementStatus = 'unknown' | 'unpaid' | 'paid';
const ONBOARDING_CHECKOUT_KEY = 'replypilot_onboarding_checkout';

const App: React.FC = () => {
    const onboardingFirstEnabled = import.meta.env.VITE_FLOW_A_ONBOARDING_FIRST !== 'false';
    const location = useLocation();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isOnboarding, setIsOnboarding] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);
    const [showAuth, setShowAuth] = useState(false);
    const [subscriptionChecked, setSubscriptionChecked] = useState(false);
    const [initialLeadId, setInitialLeadId] = useState<number | null>(null);
    const [entitlementStatus, setEntitlementStatus] = useState<EntitlementStatus>('unknown');
    const [onboardingInitialStep, setOnboardingInitialStep] = useState(1);

    const refreshEntitlement = async (): Promise<EntitlementStatus> => {
        const apiBase =
            import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
        try {
            const res = await fetch(`${apiBase}/api/subscription-status`, {
                credentials: 'include',
            });
            if (!res.ok) {
                setEntitlementStatus('unpaid');
                return 'unpaid';
            }
            const data = await res.json();
            const next: EntitlementStatus = data?.hasActiveSubscription ? 'paid' : 'unpaid';
            setEntitlementStatus(next);
            return next;
        } catch {
            setEntitlementStatus('unpaid');
            return 'unpaid';
        }
    };

    // Fade-in animation observer
    useEffect(() => {
        const run = async () => {
            const initialParams = new URLSearchParams(window.location.search);
            const shouldOpenLogin = initialParams.get('login') === '1';
            if (shouldOpenLogin) {
                setShowAuth(true);
                initialParams.delete('login');
                const nextQuery = initialParams.toString();
                const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
                window.history.replaceState({}, document.title, nextUrl);
            }

            const leadParam = new URLSearchParams(window.location.search).get('leadId');
            const parsedLead = leadParam ? Number.parseInt(leadParam, 10) : null;
            if (parsedLead && Number.isFinite(parsedLead)) {
                setInitialLeadId(parsedLead);
            }

            // Detect Stripe checkout success redirect
            const params = new URLSearchParams(window.location.search);
            const isSuccess = params.get('checkout') === 'success';
            const isCancel = params.get('checkout') === 'cancel';
            const authRequired = params.get('auth') === 'required';

            const apiBase =
                import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
            const profileRes = await fetch(`${apiBase}/api/auth/me`, {
                credentials: 'include',
            }).catch(() => null);
            const hasSession = !!profileRes?.ok;

            if (authRequired) {
                setShowAuth(true);
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            if (isSuccess) {
                trackEvent('checkout_completed_redirect');
                const fromOnboardingCheckout = window.localStorage.getItem(ONBOARDING_CHECKOUT_KEY) === '1';
                if (hasSession) {
                    await refreshEntitlement();
                    if (fromOnboardingCheckout) {
                        setOnboardingInitialStep(5);
                        setIsOnboarding(true);
                        setShowDashboard(false);
                    } else {
                        setShowDashboard(true);
                        setIsOnboarding(false);
                    }
                } else if (!onboardingFirstEnabled) {
                    setIsOnboarding(true);
                    window.scrollTo(0, 0);
                } else {
                    setShowAuth(true);
                }
                window.localStorage.removeItem(ONBOARDING_CHECKOUT_KEY);
                // Clean up URL so the flag does not persist
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            if (isCancel) {
                const fromOnboardingCheckout = window.localStorage.getItem(ONBOARDING_CHECKOUT_KEY) === '1';
                if (hasSession) {
                    if (fromOnboardingCheckout) {
                        setOnboardingInitialStep(4);
                        setIsOnboarding(true);
                        setShowDashboard(false);
                    } else {
                        await refreshEntitlement();
                        setShowDashboard(true);
                    }
                }
                window.localStorage.removeItem(ONBOARDING_CHECKOUT_KEY);
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            if (!isSuccess && !isCancel && hasSession) {
                await refreshEntitlement();
                setShowDashboard(true);
                // Restore authenticated dashboard session only for deep links.
                if (parsedLead && Number.isFinite(parsedLead)) {
                    setShowDashboard(true);
                }
            }

            setSubscriptionChecked(true);
        };
        run();

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    (entry.target as HTMLElement).style.opacity = "1";
                    (entry.target as HTMLElement).style.transform = "translateY(0)";
                }
            });
        }, { threshold: 0.1 });

        const elements = document.querySelectorAll('.fade-in-up');
        elements.forEach(el => observer.observe(el));

        return () => observer.disconnect();
    }, []);

    const handleOpenModal = () => {
        setIsModalOpen(true);
    };

    const handleSignupComplete = () => {
        trackEvent('onboarding_started', { source: 'signup_modal' });
        setOnboardingInitialStep(1);
        setIsOnboarding(true);
        setShowAuth(false);
        setShowDashboard(false);
        setIsModalOpen(false);
        window.scrollTo(0, 0);
    };

    const handleOnboardingComplete = () => {
        trackEvent('onboarding_completed');
        setOnboardingInitialStep(1);
        setIsOnboarding(false);
        setShowDashboard(true);
        refreshEntitlement();
        window.scrollTo(0, 0);
    };

    const handleStartCheckout = async (
        acceptedTerms: boolean,
        acceptedDpa: boolean,
        context: 'dashboard' | 'onboarding' = 'dashboard'
    ) => {
        trackEvent('checkout_started', { acceptedTerms, acceptedDpa });
        if (context === 'onboarding') {
            window.localStorage.setItem(ONBOARDING_CHECKOUT_KEY, '1');
        } else {
            window.localStorage.removeItem(ONBOARDING_CHECKOUT_KEY);
        }
        const apiBase =
            import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
        const res = await fetch(`${apiBase}/create-checkout-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                acceptedTerms,
                acceptedDpa,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || 'Kunne ikke starte betaling');
        }
        const body = await res.json();
        if (!body?.url) {
            throw new Error('Ugyldigt svar fra betalingsserver');
        }
        window.location.href = body.url;
    };

    const handleLogout = () => {
        setShowDashboard(false);
        setIsOnboarding(false);
        setEntitlementStatus('unknown');
        window.scrollTo(0, 0);
    };

    if (showDashboard) {
        return (
            <Dashboard
                onLogout={handleLogout}
                initialLeadId={initialLeadId}
                hasActiveSubscription={entitlementStatus === 'paid'}
                onStartCheckout={handleStartCheckout}
                onRefreshEntitlement={refreshEntitlement}
            />
        );
    }

    // Prevent flicker during initial subscription check
    if (!subscriptionChecked && !isOnboarding && !showDashboard) {
        return null;
    }

    if (isOnboarding) {
        return (
            <Onboarding
                onComplete={handleOnboardingComplete}
                initialStep={onboardingInitialStep}
                hasActiveSubscription={entitlementStatus === 'paid'}
                onStartCheckout={(acceptedTerms, acceptedDpa) =>
                    handleStartCheckout(acceptedTerms, acceptedDpa, 'onboarding')
                }
            />
        );
    }

    if (showAuth) {
        return (
            <Auth
                initialMode="login"
                onAuthenticated={() => {
                    setShowAuth(false);
                    setShowDashboard(true);
                    refreshEntitlement();
                    window.scrollTo(0, 0);
                }}
            />
        );
    }

    if (location.pathname === '/handelsbetingelser') {
        return (
            <>
                <Navbar onOpenModal={handleOpenModal} onLogin={() => setShowAuth(true)} />
                <Handelsbetingelser />
                <Footer />
            </>
        );
    }

    if (location.pathname === '/privatliv') {
        return (
            <>
                <Navbar onOpenModal={handleOpenModal} onLogin={() => setShowAuth(true)} />
                <Privatlivspolitik />
                <Footer />
            </>
        );
    }

    if (location.pathname === '/databehandleraftale') {
        return (
            <>
                <Navbar onOpenModal={handleOpenModal} onLogin={() => setShowAuth(true)} />
                <Databehandleraftale />
                <Footer />
            </>
        );
    }

    if (location.pathname === '/about-us') {
        return (
            <>
                <Navbar onOpenModal={handleOpenModal} onLogin={() => setShowAuth(true)} />
                <AboutUs />
                <Footer />
            </>
        );
    }

    if (location.pathname === '/contact-us') {
        return (
            <>
                <Navbar onOpenModal={handleOpenModal} onLogin={() => setShowAuth(true)} />
                <ContactUs />
                <Footer />
            </>
        );
    }

    if (location.pathname === '/ekstra-omsaetning') {
        return (
            <>
                <Navbar onOpenModal={handleOpenModal} onLogin={() => setShowAuth(true)} />
                <EkstraOmsaetning />
                <Footer />
            </>
        );
    }

    if (location.pathname === '/tilfredshedsgaranti') {
        return (
            <>
                <Navbar onOpenModal={handleOpenModal} onLogin={() => setShowAuth(true)} />
                <Tilfredshedsgaranti />
                <Footer />
            </>
        );
    }

    if (location.pathname === '/reset-password') {
        return <ResetPassword />;
    }

    return (
        <>
            <Navbar onOpenModal={handleOpenModal} onLogin={() => setShowAuth(true)} />
            <main>
                <Hero />
                <Reviews />
                <HowItWorks />
                <Comparison />
                <Calculator />
                <Features />
                <Pricing onStart={handleOpenModal} />
            </main>
            <Footer />
            <Modal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onAuthenticated={handleSignupComplete}
            />
        </>
    );
};

export default App;