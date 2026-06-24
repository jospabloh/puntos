import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  Gift,
  History,
  CreditCard
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import SuspendedAccountModal from '../components/loyalty/SuspendedAccountModal';
import TrialBanner from '../components/loyalty/TrialBanner';

export default function Chat() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (e) {
      base44.auth.redirectToLogin();
    }
  };

  // Fetch loyalty account
  const { data: accounts } = useQuery({
    queryKey: ['loyaltyAccount', user?.email],
    queryFn: () => base44.entities.LoyaltyAccount.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const account = accounts?.[0];

  // Fetch recent transactions for context
  const { data: transactions } = useQuery({
    queryKey: ['recentTransactions', account?.id],
    queryFn: () => base44.entities.PointsLedger.filter(
      { account_id: account?.id }, 
      '-created_date', 
      10
    ),
    enabled: !!account?.id,
  });

  // Fetch redemptions
  const { data: redemptions } = useQuery({
    queryKey: ['myRedemptions', account?.id],
    queryFn: () => base44.entities.Redemption.filter(
      { account_id: account?.id }, 
      '-created_date', 
      5
    ),
    enabled: !!account?.id,
  });

  // Fetch offers
  const { data: offers } = useQuery({
    queryKey: ['activeOffers'],
    queryFn: () => base44.entities.Offer.filter({ status: 'active' }, '-created_date', 10),
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (overrideText) => {
    const text = typeof overrideText === 'string' ? overrideText : inputValue;
    if (!text.trim() || isLoading || account?.status === 'suspended') return;

    const userMessage = text.trim();
    setInputValue('');

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Build context for the AI
      const context = {
        user: {
          name: user.full_name || user.email,
          email: user.email
        },
        account: account ? {
          balance: account.current_balance,
          tier: account.tier,
          lifetime_earned: account.lifetime_earned,
          lifetime_redeemed: account.lifetime_redeemed
        } : null,
        recent_transactions: transactions?.slice(0, 5).map(tx => ({
          type: tx.type,
          points: tx.points,
          description: tx.description,
          date: tx.created_date,
          store: tx.store_name
        })) || [],
        recent_redemptions: redemptions?.slice(0, 3).map(r => ({
          offer: r.offer_title,
          points: r.points_spent,
          status: r.status,
          code: r.confirmation_code,
          date: r.created_date
        })) || [],
        available_offers: offers?.slice(0, 5).map(o => ({
          title: o.title,
          points_cost: o.points_cost,
          category: o.category
        })) || []
      };

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Eres el asistente virtual del programa de lealtad "Puntos+". Tu nombre es Nexo.
Ayudas a los usuarios a entender su saldo de puntos, cómo ganar más, cómo canjear, y respondes dudas generales.
Siempre sé amable, conciso y útil. Responde en español mexicano.

CONTEXTO DEL USUARIO:
${JSON.stringify(context, null, 2)}

REGLAS:
- Si preguntan por saldo: menciona el balance actual y el nivel de membresía
- Si preguntan cómo ganar puntos: explica que ganan 1 punto por cada $10 MXN de compra
- Si preguntan por ofertas: menciona algunas disponibles
- Si preguntan por un canje específico: busca en redemptions
- Si no tienes información, sé honesto y sugiere visitar la sección correspondiente
- Usa emojis moderadamente para ser amigable
- Mantén respuestas cortas (máximo 3-4 oraciones)

PREGUNTA DEL USUARIO:
${userMessage}`,
        add_context_from_internet: false
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Lo siento, tuve un problema procesando tu mensaje. ¿Podrías intentar de nuevo? 🙏' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    { icon: CreditCard, label: '¿Cuál es mi saldo?', query: '¿Cuál es mi saldo actual?' },
    { icon: Sparkles, label: '¿Cómo gano puntos?', query: '¿Cómo puedo ganar más puntos?' },
    { icon: Gift, label: '¿Qué puedo canjear?', query: '¿Qué ofertas tengo disponibles?' },
    { icon: History, label: 'Mis últimos movimientos', query: '¿Cuáles fueron mis últimos movimientos?' },
  ];

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-violet-600">Cargando...</div>
      </div>
    );
  }

  const isMerchant = user?.merchant_role === 'merchant' || user?.role === 'merchant';
  const isSuspended = isMerchant && account?.status === 'suspended';
  const showTrialBanner = isMerchant && account?.subscription_status === 'trial' && account?.trial_end_date;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {isSuspended && <SuspendedAccountModal />}
      {!isSuspended && showTrialBanner && (
        <div className="fixed top-16 left-0 right-0 z-40">
          <TrialBanner trialEndDate={account?.trial_end_date} />
        </div>
      )}
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-16 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl('Home')}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3 flex-1">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-slate-900">Nexo</h1>
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  En línea
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Welcome message */}
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-8"
            >
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/25">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">¡Hola! Soy Nexo 👋</h2>
              <p className="text-slate-500 text-sm max-w-sm mx-auto">
                Tu asistente del programa de lealtad. Pregúntame sobre tus puntos, ofertas o cómo ganar más.
              </p>

              {/* Quick Actions */}
              <div className="mt-6 grid grid-cols-2 gap-2">
                {quickActions.map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <motion.button
                      key={action.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      disabled={isLoading || isSuspended}
                      onClick={() => sendMessage(action.query)}
                      className="flex items-center gap-2 p-3 bg-white rounded-xl border border-slate-200 hover:border-violet-300 hover:shadow-md transition-all text-left"
                    >
                      <Icon className="h-4 w-4 text-violet-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{action.label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Message list */}
          <div className="space-y-4">
            <AnimatePresence>
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar */}
                    <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                      message.role === 'user' 
                        ? 'bg-violet-100' 
                        : 'bg-gradient-to-br from-violet-500 to-pink-500'
                    }`}>
                      {message.role === 'user' ? (
                        <User className="h-4 w-4 text-violet-600" />
                      ) : (
                        <Bot className="h-4 w-4 text-white" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div className={`rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-violet-600 text-white'
                        : 'bg-white border border-slate-200 shadow-sm'
                    }`}>
                      {message.role === 'user' ? (
                        <p className="text-sm">{message.content}</p>
                      ) : (
                        <div className="text-sm text-slate-700 prose prose-sm prose-violet">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Loading indicator */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="flex gap-3 max-w-[85%]">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                      <span className="text-sm text-slate-500">Escribiendo...</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 pb-24 md:pb-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Escribe tu pregunta..."
              aria-label="Escribe tu pregunta"
              className="flex-1 bg-slate-50 border-0 h-12"
              disabled={isLoading || isSuspended}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!inputValue.trim() || isLoading || isSuspended}
              aria-label="Enviar mensaje"
              className="h-12 w-12 bg-violet-600 hover:bg-violet-700 rounded-xl"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}