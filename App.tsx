import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Reviews } from './components/Reviews';
import { Comparison } from './components/Comparison';
import { Calculator } from './components/Calculator';
import { Features } from './components/Features';
import { Pricing } from './components/Pricing';
import { Footer } from './components/Footer';
import { Modal } from './components/ui/Modal';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';

const App: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isOnboarding, setIsOnboarding] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);

    // Fade-in animation observer
    useEffect(() => {
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
        return <Dashboard onLogout={handleLogout} />;
    }

    if (isOnboarding) {
        return <Onboarding onComplete={handleOnboardingComplete} />;
    }

    return (
        <>
            <Navbar onOpenModal={handleOpenModal} />
            <main>
                <Hero />
                <Reviews />
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