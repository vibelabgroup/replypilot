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

const App: React.FC = () => {
    const location = useLocation();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isOnboarding, setIsOnboarding] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);
    const [showAuth, setShowAuth] = useState(false);
    const [subscriptionChecked, setSubscriptionChecked] = useState(false);
    const [initialLeadId, setInitialLeadId] = useState<number | null>(null);

    // Fade-in animation observer
    useEffect(() => {
        const run = async () => {
            const leadParam = new URLSearchParams(window.location.search).get('leadId');
            const parsedLead = leadParam ? Number.parseInt(leadParam, 10) : null;
            if (parsedLead && Number.isFinite(parsedLead)) {
                setInitialLeadId(parsedLead);
            }

            // Restore authenticated dashboard session only for deep links.
            if (parsedLead && Number.isFinite(parsedLead)) {
                try {
                    const apiBase =
                        import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
                    const profileRes = await fetch(`${apiBase}/api/auth/me`, {
                        credentials: 'include',
                    });
                    if (profileRes.ok) {
                        setShowDashboard(true);
                        setSubscriptionChecked(true);
                        return;
                    }
                } catch {
                    // Ignore and continue to existing flow.
                }
            }

            // Detect Stripe checkout success redirect
            const params = new URLSearchParams(window.location.search);
            const isSuccess = params.get('checkout') === 'success';

            if (isSuccess) {
                let email: string | null = null;
                try {
                    email = window.localStorage.getItem('replypilot_email');
                } catch {
                    email = null;
                }

                if (email) {
                    try {
                        const apiBase =
                            import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
                        const res = await fetch(
                            `${apiBase}/api/subscription-status?email=${encodeURIComponent(email)}`
                        );
                        if (res.ok) {
                            const data = await res.json();
                            if (!data.hasActiveSubscription) {
                                console.warn(
                                    'Checkout succeeded, but no active subscription found yet for',
                                    email
                                );
                            }
                        }
                    } catch (error) {
                        console.warn('Unable to verify subscription status after checkout', error);
                    }
                }

                setIsOnboarding(true);
                window.scrollTo(0, 0);
                // Clean up URL so the flag does not persist
                window.history.replaceState({}, document.title, window.location.pathname);
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

    const handlePaymentComplete = () => {
        // Payment successful, close modal is handled in Modal, now start onboarding
        setIsOnboarding(true);
        // Scroll to top
        window.scrollTo(0, 0);
    };

    const handleOnboardingComplete = () => {
        setIsOnboarding(false);
        setShowDashboard(true);
        window.scrollTo(0, 0);
    };

    const handleLogout = () => {
        setShowDashboard(false);
        setIsOnboarding(false);
        window.scrollTo(0, 0);
    };

    if (showDashboard) {
        return <Dashboard onLogout={handleLogout} initialLeadId={initialLeadId} />;
    }

    // Prevent flicker during initial subscription check
    if (!subscriptionChecked && !isOnboarding && !showDashboard) {
        return null;
    }

    if (isOnboarding) {
        return <Onboarding onComplete={handleOnboardingComplete} />;
    }

    if (showAuth) {
        return (
            <Auth
                initialMode="login"
                onAuthenticated={() => {
                    setShowAuth(false);
                    setShowDashboard(true);
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
                onPaymentComplete={handlePaymentComplete}
            />
        </>
    );
};

export default App;