import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PriceText } from '../../../shared/components/data-display/PriceText';
import { Skeleton } from '../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../shared/components/feedback/Modal';
import { useToast } from '../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../shared/components/forms/FormField';
import { MoneyInput } from '../../../shared/components/forms/MoneyInput';
import { TextInput } from '../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../shared/components/layout/PageHeader';
import { ResponsiveTable } from '../../../shared/components/layout/ResponsiveTable';
import { Button } from '../../../shared/components/ui/Button';
import { QUERY_KEYS } from '../../../shared/config/queryKeys';
import { adminApi } from '../services/adminApi';

interface MasterItem {
  id: string;
  name: string;
  categoryName: string;
  brandName: string;
  unitCode: string;
  taxRatePercent: number;
  barcode: string | null;
  mrpPaise: number;
}

export function AdminMasterCataloguePage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    categoryName: '',
    brandName: '',
    unitCode: 'pcs',
    taxRatePercent: 5,
    barcode: '',
    mrpPaise: 10000,
  });

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN_MASTER_CATALOGUE,
    queryFn: adminApi.listMasterCatalogue,
  });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createMasterProduct(form),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Master product added' });
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_MASTER_CATALOGUE });
    },
  });

  const rows = (data || []) as unknown as MasterItem[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Master Catalogue"
        subtitle="Global product templates stores can quick-add by barcode."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Master Product
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <ResponsiveTable
          rows={rows}
          getKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Product', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'cat', header: 'Category / Brand', render: (r) => `${r.categoryName} · ${r.brandName}` },
            { key: 'barcode', header: 'Barcode', render: (r) => <span className="font-mono text-xs">{r.barcode || '-'}</span> },
            { key: 'tax', header: 'Tax / Unit', render: (r) => `${r.taxRatePercent}% · ${r.unitCode}` },
            { key: 'mrp', header: 'MRP', align: 'right', render: (r) => <PriceText amountPaise={r.mrpPaise} /> },
          ]}
          renderMobileCard={(r) => (
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{r.name}</div>
                <div className="text-xs text-ink-secondary">
                  {r.categoryName} · {r.barcode || 'No barcode'}
                </div>
              </div>
              <PriceText amountPaise={r.mrpPaise} className="text-sm font-semibold" />
            </div>
          )}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Master Product"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Product Name" required>
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category" required>
              <TextInput value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })} />
            </FormField>
            <FormField label="Brand" required>
              <TextInput value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Unit Code">
              <TextInput value={form.unitCode} onChange={(e) => setForm({ ...form, unitCode: e.target.value })} />
            </FormField>
            <FormField label="Tax %">
              <TextInput
                type="number"
                value={form.taxRatePercent}
                onChange={(e) => setForm({ ...form, taxRatePercent: Number(e.target.value) })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Barcode">
              <TextInput value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </FormField>
            <FormField label="MRP">
              <MoneyInput valuePaise={form.mrpPaise} onChangePaise={(v) => setForm({ ...form, mrpPaise: v })} />
            </FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
}
