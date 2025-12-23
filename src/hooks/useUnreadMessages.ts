import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface UnreadCount {
  [ticketId: string]: number;
}

export function useUnreadMessages() {
  const { profile } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<UnreadCount>({});

  const getStorageKey = useCallback(() => {
    return profile ? `unread_messages_${profile.id}` : null;
  }, [profile]);

  const loadUnreadCounts = useCallback(() => {
    const key = getStorageKey();
    if (!key) return;
    
    const stored = localStorage.getItem(key);
    if (stored) {
      setUnreadCounts(JSON.parse(stored));
    }
  }, [getStorageKey]);

  const saveUnreadCounts = useCallback((counts: UnreadCount) => {
    const key = getStorageKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(counts));
  }, [getStorageKey]);

  const markAsRead = useCallback((ticketId: string) => {
    setUnreadCounts(prev => {
      const newCounts = { ...prev };
      delete newCounts[ticketId];
      saveUnreadCounts(newCounts);
      return newCounts;
    });
  }, [saveUnreadCounts]);

  const incrementUnread = useCallback((ticketId: string, senderId: string) => {
    if (senderId === profile?.id) return;
    
    setUnreadCounts(prev => {
      const newCounts = {
        ...prev,
        [ticketId]: (prev[ticketId] || 0) + 1
      };
      saveUnreadCounts(newCounts);
      return newCounts;
    });
  }, [profile?.id, saveUnreadCounts]);

  const getTotalUnread = useCallback(() => {
    return Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  }, [unreadCounts]);

  useEffect(() => {
    loadUnreadCounts();
  }, [loadUnreadCounts]);

  // Listen for storage events from NotificationListener
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      const key = getStorageKey();
      if (e.key === key && e.newValue) {
        setUnreadCounts(JSON.parse(e.newValue));
      }
    };

    // Also listen for custom storage events (same-tab updates)
    const handleCustomStorage = () => {
      loadUnreadCounts();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('unread-updated', handleCustomStorage);
    
    // Poll for updates every 2 seconds as fallback
    const interval = setInterval(loadUnreadCounts, 2000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('unread-updated', handleCustomStorage);
      clearInterval(interval);
    };
  }, [getStorageKey, loadUnreadCounts]);

  return {
    unreadCounts,
    markAsRead,
    incrementUnread,
    getTotalUnread,
    getUnreadCount: (ticketId: string) => unreadCounts[ticketId] || 0
  };
}

// Notification sound and tab alert
export function playNotificationSound() {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.3);
}

let originalTitle = document.title;
let blinkInterval: NodeJS.Timeout | null = null;

export function startTabAlert(message: string = 'Nova mensagem!') {
  if (blinkInterval) return;
  
  originalTitle = document.title;
  let isOriginal = true;
  
  blinkInterval = setInterval(() => {
    document.title = isOriginal ? `🔔 ${message}` : originalTitle;
    isOriginal = !isOriginal;
  }, 1000);

  // Change favicon or add visual indicator
  const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
  if (link) {
    link.dataset.originalHref = link.href;
  }
}

export function stopTabAlert() {
  if (blinkInterval) {
    clearInterval(blinkInterval);
    blinkInterval = null;
    document.title = originalTitle;
  }
}

// Stop alert when window gains focus
if (typeof window !== 'undefined') {
  window.addEventListener('focus', stopTabAlert);
}
