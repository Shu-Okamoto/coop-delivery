'use client';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

type Member = {
  id: number;
  code: string;
  name: string;
  type: 'store' | 'wholesaler' | 'farmer' | 'manufacturer';
  address: string;
  phone: string;
};

const typeLabel: Record<string, string> = {
  store: '小売',
  wholesaler: '卸',
  farmer: '生産者',
  manufacturer: '製造',
};

export default function MembersPage() {
  const [rows, setRows] = useState<Member[]>([]);
  useEffect(() => { apiGet<Member[]>('/api/members').then(setRows); }, []);

  return (
    <>
      <h2>組合員一覧</h2>
      <table>
        <thead><tr><th>コード</th><th>名称</th><th>種別</th><th>住所</th><th>連絡先</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>{m.code}</td>
              <td>{m.name}</td>
              <td>{typeLabel[m.type]}</td>
              <td>{m.address}</td>
              <td>{m.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
