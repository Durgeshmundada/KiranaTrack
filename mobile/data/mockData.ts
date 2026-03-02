import type { Bill, OutOfStockItem, UdhaarCustomer, Vendor } from '@/types/models';

const daysAgoIso = (days: number): string => {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value.toISOString();
};

export const demoVendors: Vendor[] = [
  {
    id: 'vendor-1',
    name: 'Shakti Distributors',
    phone: '+91 98765 43210',
    gstNumber: '27ABCDE1234F1Z5',
    defaultCollectorName: 'Raju Patil',
    createdAt: daysAgoIso(120),
    updatedAt: daysAgoIso(30),
  },
  {
    id: 'vendor-2',
    name: 'Mahalaxmi Foods',
    phone: '+91 98220 11223',
    gstNumber: null,
    defaultCollectorName: 'Sameer',
    createdAt: daysAgoIso(86),
    updatedAt: daysAgoIso(20),
  },
  {
    id: 'vendor-3',
    name: 'City Wholesale Mart',
    phone: '+91 98814 66771',
    gstNumber: null,
    defaultCollectorName: null,
    createdAt: daysAgoIso(65),
    updatedAt: daysAgoIso(10),
  },
];

export const demoBills: Bill[] = [
  {
    id: 'bill-1',
    billNumber: 'INV-24011',
    vendorId: 'vendor-1',
    date: daysAgoIso(42),
    totalAmountPaise: 1245000,
    imageUrl: 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?q=80&w=900&auto=format&fit=crop',
    imageHash: '3f2a45f5fd00cf2432212',
    lineItems: [
      { id: 'li-1', name: 'Rice 25kg', qty: 4, ratePaise: 465000, amountPaise: 1860000 },
      { id: 'li-2', name: 'Sugar 1kg', qty: 30, ratePaise: 4200, amountPaise: 126000 },
    ],
    payments: [
      {
        id: 'pay-1',
        billId: 'bill-1',
        amountPaise: 250000,
        date: daysAgoIso(34),
        collectorName: 'Raju Patil',
        mode: 'cash',
        notes: 'First installment',
        createdAt: daysAgoIso(34),
        editLog: [],
      },
      {
        id: 'pay-2',
        billId: 'bill-1',
        amountPaise: 150000,
        date: daysAgoIso(20),
        collectorName: 'Raju Patil',
        mode: 'upi',
        notes: null,
        createdAt: daysAgoIso(20),
        editLog: [
          {
            editedAt: daysAgoIso(18),
            previousAmountPaise: 130000,
            previousDate: daysAgoIso(22),
          },
        ],
      },
    ],
    createdAt: daysAgoIso(42),
    updatedAt: daysAgoIso(18),
  },
  {
    id: 'bill-2',
    billNumber: 'MHF-9012',
    vendorId: 'vendor-2',
    date: daysAgoIso(14),
    totalAmountPaise: 765000,
    imageUrl: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?q=80&w=900&auto=format&fit=crop',
    imageHash: '8ca9954af7a231f34bb7e',
    lineItems: [
      { id: 'li-3', name: 'Cooking Oil 15L', qty: 4, ratePaise: 192500, amountPaise: 770000 },
    ],
    payments: [
      {
        id: 'pay-3',
        billId: 'bill-2',
        amountPaise: 300000,
        date: daysAgoIso(5),
        collectorName: 'Sameer',
        mode: 'cash',
        notes: null,
        createdAt: daysAgoIso(5),
        editLog: [],
      },
    ],
    createdAt: daysAgoIso(14),
    updatedAt: daysAgoIso(5),
  },
  {
    id: 'bill-3',
    billNumber: 'CWM-3321',
    vendorId: 'vendor-3',
    date: daysAgoIso(1),
    totalAmountPaise: 289000,
    imageUrl: 'https://images.unsplash.com/photo-1579113800032-c38bd7635818?q=80&w=900&auto=format&fit=crop',
    imageHash: '12dd2a7b21aa7def89ee5',
    lineItems: [
      { id: 'li-4', name: 'Biscuits Carton', qty: 6, ratePaise: 48000, amountPaise: 288000 },
    ],
    payments: [],
    createdAt: daysAgoIso(1),
    updatedAt: daysAgoIso(1),
  },
];

export const demoOutOfStockItems: OutOfStockItem[] = [
  {
    id: 'stock-1',
    itemName: 'Tata Salt 1kg',
    status: 'pending',
    createdAt: daysAgoIso(3),
    updatedAt: daysAgoIso(3),
  },
  {
    id: 'stock-2',
    itemName: 'Maggi Noodles',
    status: 'ordered',
    createdAt: daysAgoIso(2),
    updatedAt: daysAgoIso(1),
  },
  {
    id: 'stock-3',
    itemName: 'Aashirvaad Atta 5kg',
    status: 'pending',
    createdAt: daysAgoIso(1),
    updatedAt: daysAgoIso(1),
  },
];

export const demoCustomers: UdhaarCustomer[] = [
  {
    id: 'cust-1',
    customerName: 'Ramesh Jadhav',
    phone: '+91 99210 45501',
    createdAt: daysAgoIso(40),
    updatedAt: daysAgoIso(12),
    entries: [
      {
        id: 'entry-1',
        type: 'credit',
        amountPaise: 18000,
        description: 'Monthly grocery',
        date: daysAgoIso(20),
      },
      {
        id: 'entry-2',
        type: 'repayment',
        amountPaise: 8000,
        description: null,
        date: daysAgoIso(12),
      },
    ],
  },
  {
    id: 'cust-2',
    customerName: 'Neha Kale',
    phone: null,
    createdAt: daysAgoIso(10),
    updatedAt: daysAgoIso(2),
    entries: [
      {
        id: 'entry-3',
        type: 'credit',
        amountPaise: 6500,
        description: 'Weekend items',
        date: daysAgoIso(9),
      },
      {
        id: 'entry-4',
        type: 'repayment',
        amountPaise: 6500,
        description: null,
        date: daysAgoIso(2),
      },
    ],
  },
];
