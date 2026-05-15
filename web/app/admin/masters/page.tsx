'use client';
import { useState } from 'react';
import MembersManager from '@/components/masters/MembersManager';
import VehiclesManager from '@/components/masters/VehiclesManager';
import DriversManager from '@/components/masters/DriversManager';

type Tab = 'members' | 'vehicles' | 'drivers';

export default function MastersPage() {
  const [tab, setTab] = useState<Tab>('members');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'members', label: '組合員・業者' },
    { key: 'vehicles', label: '車両' },
    { key: 'drivers', label: 'ドライバー' },
  ];

  return (
    <>
      <h2>マスタ管理</h2>
      <div className="subtabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`subtab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'members' && <MembersManager />}
      {tab === 'vehicles' && <VehiclesManager />}
      {tab === 'drivers' && <DriversManager />}
    </>
  );
}
