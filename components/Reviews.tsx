import React from 'react';
import { Star } from 'lucide-react';
import { REVIEWS } from '../constants';
import { Review } from '../types';

const ReviewCard: React.FC<{ review: Review }> = ({ review }) => (
    <div className="flex flex-col justify-between h-full bg-white p-8 rounded-[32px] w-[400px] shadow-apple border border-white/50 transition-transform hover:scale-[1.02] duration-300">
        <p className="text-[17px] leading-[1.6] font-medium text-slate-900 tracking-tight">"{review.text}"</p>
        <div className="flex items-end justify-between pt-8 mt-auto">
             <div className="flex gap-1 text-[#F59E0B]">
                 {[...Array(review.stars)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-current" />
                 ))}
             </div>
             <div className="text-right">
                 <p className="text-[15px] font-bold text-slate-900">{review.author}</p>
                 <p className="text-[13px] text-slate-500 font-medium">{review.role}</p>
             </div>
        </div>
    </div>
);

export const Reviews: React.FC = () => {
    // Duplicate reviews to create infinite scroll effect
    const marqueeItems = [...REVIEWS, ...REVIEWS];

    return (
        <section className="py-24 bg-[#F5F5F7] overflow-hidden">
            <div className="marquee-wrapper mb-8">
                <div className="marquee-track">
                    {marqueeItems.slice(0, 8).map((review, idx) => (
                        <ReviewCard key={`r1-${idx}`} review={review} />
                    ))}
                </div>
            </div>

            <div className="marquee-wrapper marquee-reverse">
                <div className="marquee-track">
                    {marqueeItems.slice(4, 12).map((review, idx) => (
                        <ReviewCard key={`r2-${idx}`} review={review} />
                    ))}
                </div>
            </div>
        </section>
    );
};