import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Download,
  Edit3,
  FileSpreadsheet,
  Flame,
  Layers,
  PackageMinus,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  TrendingDown,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { DateTimeText } from '../../../../shared/components/data-display/DateTimeText';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { ConfirmDialog } from '../../../../shared/components/feedback/ConfirmDialog';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { ImageUploader } from '../../../../shared/components/forms/ImageUploader';
import { MoneyInput } from '../../../../shared/components/forms/MoneyInput';
import { SearchBar } from '../../../../shared/components/forms/SearchBar';
import { Select } from '../../../../shared/components/forms/Select';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { Switch } from '../../../../shared/components/ui/Switch';
import { Tabs } from '../../../../shared/components/ui/Tabs';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../../../shared/hooks/useBootstrapConfig';
import type { Product } from '../../../../shared/types';
import { smoApi } from '../../services/smoApi';

interface ProductFormState {
  id?: string;
  name: string;
  categoryId: string;
  brandId: string;
  unitId: string;
  taxRateId: string;
  description: string;
  barcode: string;
  imageUrl: string | null;
  mrpPaise: number;
  sellingPricePaise: number;
  costPricePaise: number;
  stockQty: number;
  reorderLevel: number;
  batchNo: string;
  damagedQty: number;
  damageNote: string;
}

interface ParsedExcelProductRow {
  name: string;
  categoryName: string | null;
  brandName: string | null;
  unit: string | null;
  taxRatePercent: number | null;
  mrp: number | null;
  sellingPrice: number;
  costPrice: number | null;
  stockQty: number | null;
  reorderLevel: number | null;
  barcode: string | null;
  batchNo: string | null;
  damagedQty: number | null;
  damageNote: string | null;
  description: string | null;
}

function generateClientBarcode(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  const base12 = `890${digits}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const d = Number(base12[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const mod = sum % 10;
  const check = mod === 0 ? 0 : 10 - mod;
  return `${base12}${check}`;
}

function generateClientBatchNo(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `B-${datePart}-${rand}`;
}

function normalizeHeaderKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseExcelNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(String(val).replace(/[₹,\s%]/g, ''));
  return Number.isFinite(num) ? num : null;
}

export function SmoInventoryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: config } = useBootstrapConfig();

  const initialTab = location.pathname.includes('/stock')
    ? 'stock'
    : location.pathname.includes('/offers')
    ? 'offers'
    : location.pathname.includes('/suppliers')
    ? 'suppliers'
    : 'products';

  const [tab, setTab] = useState<'products' | 'predict' | 'stock' | 'offers' | 'suppliers' | 'taxonomy'>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('all');
  const [filterBrandId, setFilterBrandId] = useState('all');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'in_stock' | 'low' | 'out' | 'damaged'>('all');
  const [showArchived, setShowArchived] = useState(false);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [masterModalOpen, setMasterModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [showPerUnitCalc, setShowPerUnitCalc] = useState(false);
  const [bagPricePaise, setBagPricePaise] = useState(0);
  const [bagWeightQty, setBagWeightQty] = useState(1);

  // Excel import modal state
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [excelFileName, setExcelFileName] = useState('');
  const [parsedImportRows, setParsedImportRows] = useState<ParsedExcelProductRow[]>([]);
  const [excelParseError, setExcelParseError] = useState('');

  // Inline Category / Brand create & edit inside Add/Edit Product modal
  const [categoryInlineMode, setCategoryInlineMode] = useState<'none' | 'create' | 'edit'>('none');
  const [categoryInlineName, setCategoryInlineName] = useState('');
  const [brandInlineMode, setBrandInlineMode] = useState<'none' | 'create' | 'edit'>('none');
  const [brandInlineName, setBrandInlineName] = useState('');

  // Taxonomy tab inline rename state
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingBrandName, setEditingBrandName] = useState('');

  const defaultUnitId = config?.units[0]?.id || '';
  const defaultTaxId = config?.taxRates[0]?.id || '';

  const emptyProductForm = (): ProductFormState => ({
    name: '',
    categoryId: '',
    brandId: '',
    unitId: defaultUnitId,
    taxRateId: defaultTaxId,
    description: '',
    barcode: generateClientBarcode(),
    imageUrl: null,
    mrpPaise: 0,
    sellingPricePaise: 0,
    costPricePaise: 0,
    stockQty: 0,
    reorderLevel: config?.appSettings.defaultLowStockThreshold ?? 5,
    batchNo: generateClientBatchNo(),
    damagedQty: 0,
    damageNote: '',
  });

  const [form, setForm] = useState<ProductFormState>(emptyProductForm);

  // Stock operation form
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockForm, setStockForm] = useState<{
    productId: string;
    movementType: 'stock_in' | 'adjustment' | 'stock_take' | 'damaged';
    qtyDelta: number;
    countedQty: number;
    reason: string;
    supplierId: string;
    invoiceNo: string;
    totalCostPaise: number;
  }>({
    productId: '',
    movementType: 'stock_in',
    qtyDelta: 1,
    countedQty: 0,
    reason: 'New purchase stock-in',
    supplierId: '',
    invoiceNo: '',
    totalCostPaise: 0,
  });

  // Offer form
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerTitle, setOfferTitle] = useState('');
  const [offerType, setOfferType] = useState<'percent' | 'flat' | 'combo' | 'bogo'>('percent');
  const [offerValue, setOfferValue] = useState(10);
  const [offerProductIds, setOfferProductIds] = useState<string[]>([]);

  // Supplier / Category / Brand quick inputs
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierGst, setSupplierGst] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: [...QUERY_KEYS.SMO_PRODUCTS, showArchived],
    queryFn: () => smoApi.listProducts(showArchived),
  });
  const { data: masterProducts = [] } = useQuery({
    queryKey: ['smo', 'master-products'],
    queryFn: smoApi.listMasterProducts,
  });
  const { data: categories = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_CATEGORIES,
    queryFn: smoApi.listCategories,
  });
  const { data: brands = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_BRANDS,
    queryFn: smoApi.listBrands,
  });
  const { data: offers = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_OFFERS,
    queryFn: smoApi.listOffers,
  });
  const { data: movements = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_MOVEMENTS,
    queryFn: smoApi.listMovements,
  });
  const { data: predictions, isLoading: loadingPredictions } = useQuery({
    queryKey: QUERY_KEYS.SMO_INVENTORY_PREDICTIONS,
    queryFn: smoApi.getInventoryPredictions,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_SUPPLIERS,
    queryFn: smoApi.listSuppliers,
    enabled: user?.role === 'smo',
  });

  const invalidateInventory = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_PRODUCTS });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_MOVEMENTS });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_INVENTORY_PREDICTIONS });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_CATEGORIES });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_BRANDS });
  };

  const saveProductMutation = useMutation({
    mutationFn: async () => {
      let resolvedCategoryId = form.categoryId || null;
      let resolvedBrandId = form.brandId || null;

      // Handle unsaved inline category create/edit before saving product
      if (categoryInlineMode === 'create' && categoryInlineName.trim()) {
        const created = await smoApi.createCategory(categoryInlineName.trim());
        resolvedCategoryId = created.id;
      } else if (categoryInlineMode === 'edit' && form.categoryId && categoryInlineName.trim()) {
        await smoApi.updateCategory(form.categoryId, categoryInlineName.trim());
      }

      if (brandInlineMode === 'create' && brandInlineName.trim()) {
        const created = await smoApi.createBrand(brandInlineName.trim());
        resolvedBrandId = created.id;
      } else if (brandInlineMode === 'edit' && form.brandId && brandInlineName.trim()) {
        await smoApi.updateBrand(form.brandId, brandInlineName.trim());
      }

      const payload = {
        name: form.name.trim(),
        categoryId: resolvedCategoryId,
        brandId: resolvedBrandId,
        unitId: form.unitId || defaultUnitId,
        taxRateId: form.taxRateId || defaultTaxId,
        description: form.description.trim(),
        barcode: form.barcode.trim() || null,
        imageUrl: form.imageUrl,
        mrpPaise: form.mrpPaise,
        sellingPricePaise: form.sellingPricePaise,
        costPricePaise: form.costPricePaise,
        stockQty: form.stockQty,
        reorderLevel: form.reorderLevel,
        batchNo: form.batchNo.trim() || null,
        damagedQty: form.damagedQty,
        damageNote: form.damageNote.trim(),
      };
      if (form.id) return smoApi.updateProduct(form.id, payload);
      return smoApi.createProduct(payload);
    },
    onSuccess: () => {
      setProductModalOpen(false);
      setCategoryInlineMode('none');
      setBrandInlineMode('none');
      showToast({ tone: 'success', message: form.id ? 'Product updated.' : 'Product added.' });
      invalidateInventory();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Save failed.' }),
  });

  const bulkImportMutation = useMutation({
    mutationFn: () => smoApi.importProductsBulk(parsedImportRows as unknown as Record<string, unknown>[]),
    onSuccess: (res) => {
      setExcelImportOpen(false);
      setParsedImportRows([]);
      setExcelFileName('');
      invalidateInventory();
      showToast({
        tone: res.importedCount > 0 ? 'success' : 'warning',
        message: `Imported ${res.importedCount} product(s)${res.skippedCount > 0 ? `, ${res.skippedCount} skipped` : ''}.`,
      });
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Import failed.' }),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) => smoApi.archiveProduct(id, archive),
    onSuccess: (_res, vars) => {
      invalidateInventory();
      if (vars.archive) {
        showToast({
          tone: 'info',
          message: 'Product archived.',
          actionLabel: 'Undo',
          onAction: () => {
            void smoApi.archiveProduct(vars.id, false).then(invalidateInventory);
          },
        });
      } else {
        showToast({ tone: 'success', message: 'Product restored.' });
      }
    },
  });

  const adjustStockMutation = useMutation({
    mutationFn: () =>
      smoApi.adjustStock({
        productId: stockForm.productId,
        movementType: stockForm.movementType,
        qtyDelta: stockForm.movementType !== 'stock_take' ? stockForm.qtyDelta : undefined,
        countedQty: stockForm.movementType === 'stock_take' ? stockForm.countedQty : undefined,
        reason: stockForm.reason.trim(),
        supplierId: stockForm.supplierId || undefined,
        invoiceNo: stockForm.invoiceNo.trim() || undefined,
        totalCostPaise: stockForm.totalCostPaise || undefined,
      }),
    onSuccess: () => {
      setStockModalOpen(false);
      showToast({ tone: 'success', message: 'Stock updated.' });
      invalidateInventory();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Stock update failed.' }),
  });

  const createOfferMutation = useMutation({
    mutationFn: () =>
      smoApi.createOffer({
        title: offerTitle.trim(),
        offerType,
        discountValue: offerType === 'flat' ? Math.round(offerValue * 100) : offerValue,
        productIds: offerProductIds,
      }),
    onSuccess: () => {
      setOfferModalOpen(false);
      setOfferTitle('');
      setOfferProductIds([]);
      showToast({ tone: 'success', message: 'Offer created.' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_OFFERS });
      invalidateInventory();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to create offer.' }),
  });

  const handleSaveInlineCategory = async () => {
    const clean = categoryInlineName.trim();
    if (!clean) return;
    try {
      if (categoryInlineMode === 'create') {
        const created = await smoApi.createCategory(clean);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_CATEGORIES });
        setForm((prev) => ({ ...prev, categoryId: created.id }));
        showToast({ tone: 'success', message: `Category "${created.name}" created for your store.` });
      } else if (categoryInlineMode === 'edit' && form.categoryId) {
        const updated = await smoApi.updateCategory(form.categoryId, clean);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_CATEGORIES });
        invalidateInventory();
        showToast({ tone: 'success', message: `Category updated to "${updated.name}".` });
      }
      setCategoryInlineMode('none');
      setCategoryInlineName('');
    } catch (err: unknown) {
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Category save failed.' });
    }
  };

  const handleSaveInlineBrand = async () => {
    const clean = brandInlineName.trim();
    if (!clean) return;
    try {
      if (brandInlineMode === 'create') {
        const created = await smoApi.createBrand(clean);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_BRANDS });
        setForm((prev) => ({ ...prev, brandId: created.id }));
        showToast({ tone: 'success', message: `Brand "${created.name}" created for your store.` });
      } else if (brandInlineMode === 'edit' && form.brandId) {
        const updated = await smoApi.updateBrand(form.brandId, clean);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_BRANDS });
        invalidateInventory();
        showToast({ tone: 'success', message: `Brand updated to "${updated.name}".` });
      }
      setBrandInlineMode('none');
      setBrandInlineName('');
    } catch (err: unknown) {
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Brand save failed.' });
    }
  };

  const handleExportExcel = () => {
    const exportRows = products.map((p) => ({
      'Product Name': p.name,
      Barcode: p.barcode || '',
      'Batch No': p.batchNo || '',
      Category: p.categoryName || '',
      Brand: p.brandName || '',
      Unit: p.unitCode || p.unitLabel || 'pcs',
      'Tax Rate (%)': p.taxRatePercent ?? 0,
      MRP: Number((p.mrpPaise / 100).toFixed(2)),
      'Selling Price': Number((p.sellingPricePaise / 100).toFixed(2)),
      'Cost Price': Number((p.costPricePaise / 100).toFixed(2)),
      'Stock Qty': p.stockQty,
      'Available Qty': p.availableQty,
      'Reserved Qty': p.reservedQty,
      'Reorder Level': p.reorderLevel,
      'Damaged Qty': p.damagedQty ?? 0,
      'Damage Note': p.damageNote || '',
      Description: p.description || '',
      Status: p.archivedAt ? 'Archived' : p.availableQty <= 0 ? 'Out of Stock' : 'Active',
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [
      { wch: 28 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
      { wch: 8 },
      { wch: 12 },
      { wch: 10 },
      { wch: 13 },
      { wch: 12 },
      { wch: 11 },
      { wch: 13 },
      { wch: 13 },
      { wch: 13 },
      { wch: 13 },
      { wch: 26 },
      { wch: 30 },
      { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast({ tone: 'success', message: `Exported ${exportRows.length} product(s) to Excel.` });
  };

  const handleDownloadSampleTemplate = () => {
    const templateRows = [
      {
        'Product Name': 'Sona Masoori Rice 5kg',
        Category: 'Staples & Grains',
        Brand: 'Royal Harvest',
        Unit: 'pack',
        'Tax Rate (%)': 5,
        MRP: 340,
        'Selling Price': 315,
        'Cost Price': 275,
        'Stock Qty': 25,
        'Reorder Level': 5,
        Barcode: '',
        'Batch No': '',
        'Damaged Qty': 0,
        'Damage Note': '',
        Description: 'Aged premium rice (leave Barcode & Batch No blank to auto-generate)',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [
      { wch: 26 },
      { wch: 18 },
      { wch: 16 },
      { wch: 8 },
      { wch: 13 },
      { wch: 10 },
      { wch: 13 },
      { wch: 12 },
      { wch: 11 },
      { wch: 13 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 24 },
      { wch: 36 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'inventory-import-template.xlsx');
  };

  const handleExcelFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setExcelParseError('');
    setExcelFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        setExcelParseError('No worksheet found in the uploaded file.');
        setParsedImportRows([]);
        return;
      }
      const rawObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
        defval: '',
      });
      if (rawObjects.length === 0) {
        setExcelParseError('The uploaded spreadsheet has no data rows.');
        setParsedImportRows([]);
        return;
      }

      const mapped: ParsedExcelProductRow[] = [];
      for (const raw of rawObjects) {
        const byNorm: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) {
          byNorm[normalizeHeaderKey(k)] = v;
        }
        const name = String(
          byNorm.productname ?? byNorm.name ?? byNorm.itemname ?? byNorm.product ?? ''
        ).trim();
        if (!name) continue;

        const sellingPrice =
          parseExcelNumber(
            byNorm.sellingprice ?? byNorm.selling ?? byNorm.price ?? byNorm.saleprice
          ) ?? 0;

        mapped.push({
          name,
          categoryName:
            String(byNorm.category ?? byNorm.categoryname ?? '').trim() || null,
          brandName: String(byNorm.brand ?? byNorm.brandname ?? '').trim() || null,
          unit: String(byNorm.unit ?? byNorm.unitcode ?? '').trim() || null,
          taxRatePercent: parseExcelNumber(byNorm.taxrate ?? byNorm.tax ?? byNorm.gst ?? byNorm.taxratepercent),
          mrp: parseExcelNumber(byNorm.mrp),
          sellingPrice,
          costPrice: parseExcelNumber(byNorm.costprice ?? byNorm.cost ?? byNorm.purchaseprice),
          stockQty: parseExcelNumber(byNorm.stockqty ?? byNorm.stock ?? byNorm.qty ?? byNorm.quantity),
          reorderLevel: parseExcelNumber(byNorm.reorderlevel ?? byNorm.reorder ?? byNorm.minstock),
          barcode: String(byNorm.barcode ?? '').trim() || null,
          batchNo: String(byNorm.batchno ?? byNorm.batch ?? '').trim() || null,
          damagedQty: parseExcelNumber(byNorm.damagedqty ?? byNorm.damaged ?? byNorm.damageqty),
          damageNote: String(byNorm.damagenote ?? byNorm.damagerisk ?? '').trim() || null,
          description: String(byNorm.description ?? byNorm.desc ?? '').trim() || null,
        });
      }

      if (mapped.length === 0) {
        setExcelParseError(
          'Could not find any rows with a "Product Name" or "Name" column. Download the template for desired headers.'
        );
        setParsedImportRows([]);
        return;
      }
      setParsedImportRows(mapped);
    } catch (err: unknown) {
      setExcelParseError(err instanceof Error ? err.message : 'Unable to parse spreadsheet.');
      setParsedImportRows([]);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filterCategoryId !== 'all') {
        if (filterCategoryId === 'uncategorized') {
          if (p.categoryId) return false;
        } else if (p.categoryId !== filterCategoryId) {
          return false;
        }
      }
      if (filterBrandId !== 'all') {
        if (filterBrandId === 'unbranded') {
          if (p.brandId) return false;
        } else if (p.brandId !== filterBrandId) {
          return false;
        }
      }
      if (filterStockStatus === 'in_stock' && p.availableQty <= p.reorderLevel) return false;
      if (filterStockStatus === 'low' && !(p.availableQty > 0 && p.availableQty <= p.reorderLevel)) return false;
      if (filterStockStatus === 'out' && p.availableQty > 0) return false;
      if (filterStockStatus === 'damaged' && !((p.damagedQty ?? 0) > 0 || Boolean(p.damageNote?.trim()))) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.batchNo && p.batchNo.toLowerCase().includes(q)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q)) ||
        (p.brandName && p.brandName.toLowerCase().includes(q))
      );
    });
  }, [products, search, filterCategoryId, filterBrandId, filterStockStatus]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    filterCategoryId !== 'all' ||
    filterBrandId !== 'all' ||
    filterStockStatus !== 'all';

  const openEditProduct = (p: Product) => {
    setCategoryInlineMode('none');
    setBrandInlineMode('none');
    setShowPerUnitCalc(false);
    setForm({
      id: p.id,
      name: p.name,
      categoryId: p.categoryId || '',
      brandId: p.brandId || '',
      unitId: p.unitId,
      taxRateId: p.taxRateId,
      description: p.description || '',
      barcode: p.barcode || generateClientBarcode(),
      imageUrl: p.imageUrl,
      mrpPaise: p.mrpPaise,
      sellingPricePaise: p.sellingPricePaise,
      costPricePaise: p.costPricePaise,
      stockQty: p.stockQty,
      reorderLevel: p.reorderLevel,
      batchNo: p.batchNo || generateClientBatchNo(),
      damagedQty: p.damagedQty ?? 0,
      damageNote: p.damageNote || '',
    });
    setProductModalOpen(true);
  };

  const openStockForProduct = (
    productId: string,
    movementType: 'stock_in' | 'adjustment' | 'stock_take' | 'damaged' = 'stock_in',
    suggestedQty = 10,
    reason = 'Purchase stock-in'
  ) => {
    const target = products.find((p) => p.id === productId);
    setStockForm({
      productId,
      movementType,
      qtyDelta: suggestedQty,
      countedQty: target?.stockQty ?? 0,
      reason,
      supplierId: '',
      invoiceNo: '',
      totalCostPaise: 0,
    });
    setStockModalOpen(true);
  };

  const isOwner = user?.role === 'smo';
  const predictAlertCount =
    (predictions?.summary.lowStockCount ?? 0) +
    (predictions?.summary.deadStockCount ?? 0) +
    (predictions?.summary.damagedRiskCount ?? 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory & Catalogue"
        subtitle="Single unified stock across POS billing and Online Storefront, with demand & risk predictions."
        actions={
          isOwner && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setMasterModalOpen(true)}>
                <Sparkles className="h-4 w-4" /> Quick-Add Master
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setParsedImportRows([]);
                  setExcelFileName('');
                  setExcelParseError('');
                  setExcelImportOpen(true);
                }}
              >
                <Upload className="h-4 w-4" /> Import Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExportExcel}>
                <Download className="h-4 w-4" /> Export Excel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setCategoryInlineMode('none');
                  setBrandInlineMode('none');
                  setShowPerUnitCalc(false);
                  setForm(emptyProductForm());
                  setProductModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add Product
              </Button>
            </div>
          )
        }
      />

      <Tabs
        activeId={tab}
        onChange={(id) => {
          const next = id as typeof tab;
          setTab(next);
          if (next === 'products') navigate(ROUTES.OWNER_INVENTORY);
          if (next === 'stock') navigate(ROUTES.OWNER_STOCK_OPERATIONS);
          if (next === 'offers') navigate(ROUTES.OWNER_OFFERS);
          if (next === 'suppliers') navigate(ROUTES.OWNER_SUPPLIERS);
        }}
        options={[
          { id: 'products', label: 'Products', count: products.length },
          { id: 'predict', label: 'Stock Prediction', count: predictAlertCount },
          { id: 'stock', label: 'Stock Operations' },
          { id: 'offers', label: 'Offers', count: offers.length },
          ...(isOwner ? [{ id: 'suppliers', label: 'Suppliers', count: suppliers.length }] : []),
          { id: 'taxonomy', label: 'Categories & Brands' },
        ]}
      />

      {tab === 'products' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="w-full sm:w-72">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search item, barcode, batch..."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <Select
                  aria-label="Filter by category"
                  value={filterCategoryId}
                  onChange={(e) => setFilterCategoryId(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  <option value="uncategorized">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-36">
                <Select
                  aria-label="Filter by brand"
                  value={filterBrandId}
                  onChange={(e) => setFilterBrandId(e.target.value)}
                >
                  <option value="all">All Brands</option>
                  <option value="unbranded">No Brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-36">
                <Select
                  aria-label="Filter by stock status"
                  value={filterStockStatus}
                  onChange={(e) =>
                    setFilterStockStatus(e.target.value as 'all' | 'in_stock' | 'low' | 'out' | 'damaged')
                  }
                >
                  <option value="all">All Stock Status</option>
                  <option value="in_stock">Healthy Stock</option>
                  <option value="low">Low Stock</option>
                  <option value="out">Out of Stock</option>
                  <option value="damaged">Damaged Risk</option>
                </Select>
              </div>
              {hasActiveFilters && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSearch('');
                    setFilterCategoryId('all');
                    setFilterBrandId('all');
                    setFilterStockStatus('all');
                  }}
                >
                  Reset
                </Button>
              )}
              <Switch label="Show archived" checked={showArchived} onChange={setShowArchived} />
            </div>
          </div>

          {hasActiveFilters && products.length > 0 && (
            <div className="text-xs text-ink-muted">
              Showing {filteredProducts.length} of {products.length} item(s)
            </div>
          )}

          {loadingProducts ? (
            <Skeleton className="h-40 w-full" />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              title={products.length === 0 ? 'No products in your store yet' : 'No matching items found'}
              description={
                products.length === 0
                  ? 'Add your first product, import an Excel sheet, or copy a template from Master Catalogue.'
                  : 'Try adjusting your search or category, brand, and stock filters.'
              }
              action={
                isOwner && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      onClick={() => {
                        setCategoryInlineMode('none');
                        setBrandInlineMode('none');
                        setForm(emptyProductForm());
                        setProductModalOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" /> Add Product
                    </Button>
                    <Button variant="secondary" onClick={() => setExcelImportOpen(true)}>
                      <Upload className="h-4 w-4" /> Import Excel
                    </Button>
                  </div>
                )
              }
            />
          ) : (
            <div className="space-y-2.5">
              {filteredProducts.map((p) => {
                const isLow = p.availableQty <= p.reorderLevel && p.availableQty > 0;
                const isOut = p.availableQty <= 0;
                const hasDamage = (p.damagedQty ?? 0) > 0 || Boolean(p.damageNote?.trim());
                return (
                  <Card key={p.id} padding="md" className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          referrerPolicy="no-referrer"
                          className="h-12 w-12 rounded-lg object-cover bg-surface-subtle shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-surface-subtle flex items-center justify-center text-ink-muted shrink-0">
                          <PackagePlus className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink-primary truncate">{p.name}</span>
                          {p.archivedAt && <StatusChip kind="custom" code="archived" overrideLabel="Archived" />}
                          {isOut && !p.archivedAt && (
                            <StatusChip kind="custom" code="out" overrideLabel="Out of Stock" overrideTone="danger" />
                          )}
                          {isLow && !p.archivedAt && (
                            <StatusChip kind="custom" code="low" overrideLabel="Low Stock" overrideTone="warning" />
                          )}
                          {hasDamage && !p.archivedAt && (
                            <StatusChip kind="custom" code="dmg" overrideLabel="Damaged Risk" overrideTone="danger" />
                          )}
                        </div>
                        <div className="text-xs text-ink-secondary mt-0.5">
                          {p.categoryName || 'Uncategorized'}
                          {p.brandName ? ` · ${p.brandName}` : ''} · Stock:{' '}
                          <span className="font-mono font-semibold text-ink-primary">
                            {p.stockQty} {p.unitLabel || ''}
                          </span>
                          {p.reservedQty > 0 ? ` (${p.reservedQty} reserved)` : ''}
                        </div>
                        <div className="text-[11px] text-ink-muted font-mono mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {p.barcode && <span>Barcode: {p.barcode}</span>}
                          {p.batchNo && <span>Batch: {p.batchNo}</span>}
                          {hasDamage && (
                            <span className="text-status-danger-fg font-sans">
                              Damaged: {p.damagedQty ?? 0} {p.unitLabel || ''}
                              {p.damageNote ? ` — ${p.damageNote}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold text-ink-primary">
                          <PriceText amountPaise={p.sellingPricePaise} />{' '}
                          <span className="text-xs font-normal text-ink-muted">/ {p.unitLabel || p.unitCode || 'pcs'}</span>
                        </div>
                        <div className="text-[11px] text-ink-muted">
                          Cost <PriceText amountPaise={p.costPricePaise} /> · MRP <PriceText amountPaise={p.mrpPaise} />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openStockForProduct(p.id)}>
                          Stock
                        </Button>
                        {isOwner && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Edit ${p.name}`}
                              onClick={() => openEditProduct(p)}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            {p.archivedAt ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Restore ${p.name}`}
                                onClick={() => archiveMutation.mutate({ id: p.id, archive: false })}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Delete ${p.name}`}
                                onClick={() => setDeleteTarget(p)}
                              >
                                <Trash2 className="h-4 w-4 text-status-danger-fg" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'predict' && (
        <div className="space-y-4">
          {loadingPredictions ? (
            <Skeleton className="h-48 w-full" />
          ) : !predictions ? (
            <EmptyState
              title="No prediction data yet"
              description="Add products and process POS or Online orders to unlock stock intelligence."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card padding="md">
                  <div className="text-xs text-ink-secondary flex items-center justify-between">
                    <span>Low Stock Items</span>
                    <AlertTriangle className="h-4 w-4 text-status-warning-fg" />
                  </div>
                  <div className="text-2xl font-bold text-ink-primary font-mono mt-1">
                    {predictions.summary.lowStockCount}
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">Below reorder or &le;7 days cover</div>
                </Card>
                <Card padding="md">
                  <div className="text-xs text-ink-secondary flex items-center justify-between">
                    <span>High Demand ({predictions.monthLabel})</span>
                    <Flame className="h-4 w-4 text-accent-primary" />
                  </div>
                  <div className="text-2xl font-bold text-ink-primary font-mono mt-1">
                    {predictions.summary.highDemandCount}
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">Unified Online + POS movers</div>
                </Card>
                <Card padding="md">
                  <div className="text-xs text-ink-secondary flex items-center justify-between">
                    <span>Dead Stock</span>
                    <TrendingDown className="h-4 w-4 text-ink-muted" />
                  </div>
                  <div className="text-2xl font-bold text-ink-primary font-mono mt-1">
                    {predictions.summary.deadStockCount}
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">Zero sales (no one taking)</div>
                </Card>
                <Card padding="md">
                  <div className="text-xs text-ink-secondary flex items-center justify-between">
                    <span>Damaged Risks</span>
                    <PackageMinus className="h-4 w-4 text-status-danger-fg" />
                  </div>
                  <div className="text-2xl font-bold text-ink-primary font-mono mt-1">
                    {predictions.summary.damagedRiskCount}
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">Owner-flagged damage items</div>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 1. Low Stock Alerts */}
                <Card padding="md" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-status-warning-fg" />
                      Low Stock Alerts ({predictions.lowStock.length})
                    </h3>
                  </div>
                  {predictions.lowStock.length === 0 ? (
                    <p className="text-xs text-ink-muted py-4 text-center">
                      All active items are above reorder levels.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {predictions.lowStock.map((item) => (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border-default p-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-ink-primary truncate">{item.name}</span>
                              <StatusChip
                                kind="custom"
                                code={item.severity}
                                overrideLabel={item.availableQty <= 0 ? 'Out of Stock' : 'Low Stock'}
                                overrideTone={item.severity === 'critical' ? 'danger' : 'warning'}
                              />
                            </div>
                            <p className="text-xs text-ink-secondary mt-0.5">{item.reason}</p>
                            <p className="text-[11px] text-ink-muted">
                              Available: {item.availableQty} {item.unitLabel} · Suggested restock: +
                              {item.suggestedRestockQty} {item.unitLabel}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              openStockForProduct(
                                item.productId,
                                'stock_in',
                                item.suggestedRestockQty,
                                'Low stock restock'
                              )
                            }
                          >
                            Restock
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* 2. High Demand This Month */}
                <Card padding="md" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
                      <Flame className="h-4 w-4 text-accent-primary" />
                      High Demand — {predictions.monthLabel} ({predictions.highDemandThisMonth.length})
                    </h3>
                  </div>
                  {predictions.highDemandThisMonth.length === 0 ? (
                    <p className="text-xs text-ink-muted py-4 text-center">
                      No POS or online sales recorded yet for {predictions.monthLabel}.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {predictions.highDemandThisMonth.map((item) => (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border-default p-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-ink-primary truncate">{item.name}</span>
                              <StatusChip
                                kind="custom"
                                code="demand"
                                overrideLabel={`${item.monthlyUnitsSold} ${item.unitLabel} sold`}
                                overrideTone="info"
                              />
                            </div>
                            <p className="text-xs text-ink-secondary mt-0.5">{item.reason}</p>
                            <p className="text-[11px] text-ink-muted">
                              Stock left: {item.availableQty} {item.unitLabel}
                              {item.daysOfCover !== null ? ` (~${item.daysOfCover} days cover)` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <PriceText
                              amountPaise={item.monthlyRevenuePaise}
                              className="text-sm font-bold text-ink-primary"
                            />
                            <div className="text-[11px] text-ink-muted">This month</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* 3. Dead Stock (No One Taking) */}
                <Card padding="md" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
                      <TrendingDown className="h-4 w-4 text-ink-muted" />
                      Dead Stock — No One Taking ({predictions.deadStock.length})
                    </h3>
                  </div>
                  {predictions.deadStock.length === 0 ? (
                    <p className="text-xs text-ink-muted py-4 text-center">
                      No dead stock! Every stocked product has recent movement.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {predictions.deadStock.map((item) => (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border-default p-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-ink-primary truncate">{item.name}</span>
                              <StatusChip kind="custom" code="dead" overrideLabel="Dead Stock" overrideTone="neutral" />
                            </div>
                            <p className="text-xs text-ink-secondary mt-0.5">{item.reason}</p>
                            <p className="text-[11px] text-ink-muted">
                              Idle capital: <PriceText amountPaise={item.idleValuePaise} className="font-semibold" /> ·{' '}
                              {item.daysIdle} day(s) idle
                            </p>
                          </div>
                          {isOwner && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setOfferTitle(`Clearance: ${item.name}`);
                                setOfferType('percent');
                                setOfferValue(15);
                                setOfferProductIds([item.productId]);
                                setOfferModalOpen(true);
                              }}
                            >
                              Create Offer
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* 4. Damaged Risks */}
                <Card padding="md" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
                      <PackageMinus className="h-4 w-4 text-status-danger-fg" />
                      Damaged Risks ({predictions.damagedRisks.length})
                    </h3>
                  </div>
                  {predictions.damagedRisks.length === 0 ? (
                    <p className="text-xs text-ink-muted py-4 text-center">
                      No damaged stock or damage risk notes recorded. Update a product or log a Damaged movement to track.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {predictions.damagedRisks.map((item) => (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border-default p-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-ink-primary truncate">{item.name}</span>
                              <StatusChip
                                kind="custom"
                                code="dmg"
                                overrideLabel={`${item.damagedQty} ${item.unitLabel} damaged`}
                                overrideTone="danger"
                              />
                            </div>
                            <p className="text-xs text-status-danger-fg mt-0.5">{item.damageNote}</p>
                            <p className="text-[11px] text-ink-muted">
                              Estimated cost impact:{' '}
                              <PriceText amountPaise={item.estimatedLossPaise} className="font-semibold" /> · Good stock:{' '}
                              {item.availableQty} {item.unitLabel}
                            </p>
                          </div>
                          {isOwner && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const prod = products.find((p) => p.id === item.productId);
                                if (prod) openEditProduct(prod);
                              }}
                            >
                              Update
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'stock' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              disabled={products.length === 0}
              onClick={() => {
                if (products[0]) openStockForProduct(products[0].id);
              }}
            >
              <Plus className="h-4 w-4" /> Record Stock Movement
            </Button>
          </div>
          {movements.length === 0 ? (
            <EmptyState title="No stock movements yet" description="Stock-ins, sales, and adjustments appear here." />
          ) : (
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border-default bg-surface-subtle text-xs text-ink-secondary">
                  <tr>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Delta</th>
                    <th className="px-4 py-2.5">After</th>
                    <th className="px-4 py-2.5">Reason</th>
                    <th className="px-4 py-2.5">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 font-medium text-ink-primary">{m.productName}</td>
                      <td className="px-4 py-2.5 text-xs uppercase text-ink-secondary">
                        {m.movementType.replace(/_/g, ' ')}
                      </td>
                      <td
                        className={`px-4 py-2.5 font-mono font-semibold ${
                          m.qtyDelta >= 0 ? 'text-status-success-fg' : 'text-status-danger-fg'
                        }`}
                      >
                        {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                      </td>
                      <td className="px-4 py-2.5 font-mono">{m.qtyAfter}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-secondary">{m.reason}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-muted">
                        <DateTimeText iso={m.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {tab === 'offers' && (
        <div className="space-y-3">
          {isOwner && (
            <div className="flex justify-end">
              <Button disabled={products.length === 0} onClick={() => setOfferModalOpen(true)}>
                <Tag className="h-4 w-4" /> Create Offer
              </Button>
            </div>
          )}
          {offers.length === 0 ? (
            <EmptyState
              title="No active offers"
              description="Create percentage or flat discounts to attract online and POS customers."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {offers.map((o) => (
                <Card key={o.id} padding="md" className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink-primary">{o.title}</div>
                    <div className="text-xs text-ink-secondary mt-0.5">
                      {o.offerType === 'percent' ? `${o.discountValue}% off` : <PriceText amountPaise={o.discountValue} />}{' '}
                      · {o.productIds.length} product(s)
                    </div>
                  </div>
                  {isOwner && (
                    <Switch
                      label={o.isActive ? 'Active' : 'Paused'}
                      checked={o.isActive}
                      onChange={async (checked) => {
                        await smoApi.toggleOffer(o.id, checked);
                        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_OFFERS });
                        invalidateInventory();
                      }}
                    />
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'suppliers' && isOwner && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Card padding="md" className="md:col-span-5 space-y-3">
            <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
              <Truck className="h-4 w-4" /> Add Supplier
            </h3>
            <FormField label="Supplier Name" htmlFor="sup-name" required>
              <TextInput id="sup-name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            </FormField>
            <FormField label="Phone" htmlFor="sup-phone">
              <TextInput id="sup-phone" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
            </FormField>
            <FormField label="GSTIN" htmlFor="sup-gst">
              <TextInput id="sup-gst" value={supplierGst} onChange={(e) => setSupplierGst(e.target.value)} />
            </FormField>
            <Button
              disabled={!supplierName.trim()}
              onClick={async () => {
                await smoApi.createSupplier({ name: supplierName.trim(), phone: supplierPhone.trim(), gstNo: supplierGst.trim() });
                setSupplierName('');
                setSupplierPhone('');
                setSupplierGst('');
                void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_SUPPLIERS });
                showToast({ tone: 'success', message: 'Supplier saved.' });
              }}
            >
              Save Supplier
            </Button>
          </Card>

          <div className="md:col-span-7 space-y-2.5">
            {suppliers.length === 0 ? (
              <EmptyState title="No suppliers yet" description="Track distributors and purchase invoices." />
            ) : (
              suppliers.map((s) => (
                <Card key={s.id} padding="md" className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink-primary">{s.name}</div>
                    <div className="text-xs text-ink-secondary">
                      {s.phone || 'No phone'} {s.gstNo ? `· GST ${s.gstNo}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-ink-muted">Payable</div>
                    <PriceText amountPaise={s.payablePaise} className="text-sm font-bold" />
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'taxonomy' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card padding="md" className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
                <Layers className="h-4 w-4" /> Store Categories ({categories.length})
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Custom categories created here belong strictly to your store and appear on your Customer storefront.
              </p>
            </div>
            {isOwner && (
              <div className="flex gap-2">
                <TextInput
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name"
                />
                <Button
                  disabled={!newCategoryName.trim()}
                  onClick={async () => {
                    try {
                      await smoApi.createCategory(newCategoryName.trim());
                      setNewCategoryName('');
                      invalidateInventory();
                      showToast({ tone: 'success', message: 'Category added.' });
                    } catch (err: unknown) {
                      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed.' });
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {categories.length === 0 ? (
                <p className="text-xs text-ink-muted">No custom categories yet.</p>
              ) : (
                categories.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border-default bg-surface-subtle text-xs"
                  >
                    {editingCatId === c.id ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <TextInput
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!editingCatName.trim()) return;
                            try {
                              await smoApi.updateCategory(c.id, editingCatName.trim());
                              setEditingCatId(null);
                              invalidateInventory();
                              showToast({ tone: 'success', message: 'Category renamed.' });
                            } catch (err: unknown) {
                              showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Rename failed.' });
                            }
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingCatId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-ink-primary">{c.name}</span>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCatId(c.id);
                              setEditingCatName(c.name);
                            }}
                            className="text-ink-muted hover:text-ink-primary p-1 cursor-pointer"
                            aria-label={`Edit category ${c.name}`}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card padding="md" className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">Store Brands ({brands.length})</h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Custom brands are isolated to your store and shown as brand filters for your shoppers.
              </p>
            </div>
            {isOwner && (
              <div className="flex gap-2">
                <TextInput
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="New brand name"
                />
                <Button
                  disabled={!newBrandName.trim()}
                  onClick={async () => {
                    try {
                      await smoApi.createBrand(newBrandName.trim());
                      setNewBrandName('');
                      invalidateInventory();
                      showToast({ tone: 'success', message: 'Brand added.' });
                    } catch (err: unknown) {
                      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed.' });
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {brands.length === 0 ? (
                <p className="text-xs text-ink-muted">No custom brands yet.</p>
              ) : (
                brands.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border-default bg-surface-subtle text-xs"
                  >
                    {editingBrandId === b.id ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <TextInput
                          value={editingBrandName}
                          onChange={(e) => setEditingBrandName(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!editingBrandName.trim()) return;
                            try {
                              await smoApi.updateBrand(b.id, editingBrandName.trim());
                              setEditingBrandId(null);
                              invalidateInventory();
                              showToast({ tone: 'success', message: 'Brand renamed.' });
                            } catch (err: unknown) {
                              showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Rename failed.' });
                            }
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingBrandId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-ink-primary">{b.name}</span>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBrandId(b.id);
                              setEditingBrandName(b.name);
                            }}
                            className="text-ink-muted hover:text-ink-primary p-1 cursor-pointer"
                            aria-label={`Edit brand ${b.name}`}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={form.id ? 'Edit Product' : 'Add Product'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setProductModalOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={saveProductMutation.isPending}
              disabled={!form.name.trim() || form.sellingPricePaise <= 0}
              onClick={() => saveProductMutation.mutate()}
            >
              Save Product
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Product Name" htmlFor="prod-name" required>
            <TextInput
              id="prod-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>

          {/* Store-Isolated Custom Category & Brand */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="prod-cat" className="text-xs font-medium text-ink-primary">
                  Category (Store-only)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryInlineMode('create');
                      setCategoryInlineName('');
                    }}
                    className="text-accent-primary font-medium hover:underline cursor-pointer"
                  >
                    + Custom
                  </button>
                  {form.categoryId && (
                    <button
                      type="button"
                      onClick={() => {
                        const cur = categories.find((c) => c.id === form.categoryId);
                        setCategoryInlineMode('edit');
                        setCategoryInlineName(cur?.name || '');
                      }}
                      className="text-ink-secondary font-medium hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              <Select
                id="prod-cat"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {categoryInlineMode !== 'none' && (
                <div className="flex items-center gap-1.5 pt-1">
                  <TextInput
                    value={categoryInlineName}
                    onChange={(e) => setCategoryInlineName(e.target.value)}
                    placeholder={
                      categoryInlineMode === 'edit' ? 'Rename selected category...' : 'Type custom category...'
                    }
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!categoryInlineName.trim()}
                    onClick={() => void handleSaveInlineCategory()}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCategoryInlineMode('none');
                      setCategoryInlineName('');
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="prod-brand" className="text-xs font-medium text-ink-primary">
                  Brand (Store-only)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setBrandInlineMode('create');
                      setBrandInlineName('');
                    }}
                    className="text-accent-primary font-medium hover:underline cursor-pointer"
                  >
                    + Custom
                  </button>
                  {form.brandId && (
                    <button
                      type="button"
                      onClick={() => {
                        const cur = brands.find((b) => b.id === form.brandId);
                        setBrandInlineMode('edit');
                        setBrandInlineName(cur?.name || '');
                      }}
                      className="text-ink-secondary font-medium hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              <Select
                id="prod-brand"
                value={form.brandId}
                onChange={(e) => setForm({ ...form, brandId: e.target.value })}
              >
                <option value="">No Brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              {brandInlineMode !== 'none' && (
                <div className="flex items-center gap-1.5 pt-1">
                  <TextInput
                    value={brandInlineName}
                    onChange={(e) => setBrandInlineName(e.target.value)}
                    placeholder={
                      brandInlineMode === 'edit' ? 'Rename selected brand...' : 'Type custom brand...'
                    }
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!brandInlineName.trim()}
                    onClick={() => void handleSaveInlineBrand()}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setBrandInlineMode('none');
                      setBrandInlineName('');
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Unit" htmlFor="prod-unit" required>
              <Select
                id="prod-unit"
                value={form.unitId || defaultUnitId}
                onChange={(e) => setForm({ ...form, unitId: e.target.value })}
              >
                {config?.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label} ({u.code})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="GST Slab" htmlFor="prod-tax" required>
              <Select
                id="prod-tax"
                value={form.taxRateId || defaultTaxId}
                onChange={(e) => setForm({ ...form, taxRateId: e.target.value })}
              >
                {config?.taxRates.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name} ({tr.ratePercent}%)
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {(() => {
            const activeUnit =
              config?.units.find((u) => u.id === (form.unitId || defaultUnitId)) || config?.units[0];
            const unitLabel = activeUnit?.label || activeUnit?.code || 'unit';
            const unitCode = (activeUnit?.code || unitLabel).toLowerCase();
            const isWeightKg = unitCode === 'kg';
            const isLitre = unitCode === 'litre' || unitCode === 'l';
            const marginPaise = form.sellingPricePaise - form.costPricePaise;
            const marginPct =
              form.sellingPricePaise > 0 ? Math.round((marginPaise / form.sellingPricePaise) * 1000) / 10 : 0;

            return (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  <FormField label={`MRP (per ${unitLabel})`} htmlFor="prod-mrp">
                    <MoneyInput
                      id="prod-mrp"
                      valuePaise={form.mrpPaise}
                      onChangePaise={(v) => setForm({ ...form, mrpPaise: v })}
                    />
                  </FormField>
                  <FormField label={`Selling Price (per ${unitLabel})`} htmlFor="prod-sell" required>
                    <MoneyInput
                      id="prod-sell"
                      valuePaise={form.sellingPricePaise}
                      onChangePaise={(v) => setForm({ ...form, sellingPricePaise: v })}
                    />
                  </FormField>
                  <FormField label={`Cost Price (per ${unitLabel})`} htmlFor="prod-cost">
                    <MoneyInput
                      id="prod-cost"
                      valuePaise={form.costPricePaise}
                      onChangePaise={(v) => setForm({ ...form, costPricePaise: v })}
                    />
                  </FormField>
                </div>

                {/* Per-Unit (e.g. per kg) Selling Price Guide & Bulk Calculator */}
                <div className="rounded-xl border border-border-default bg-surface-subtle/50 p-3 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-ink-primary font-medium">
                      Unit Pricing ({unitLabel}):{' '}
                      <span className="font-bold">
                        <PriceText amountPaise={form.sellingPricePaise} /> / {unitLabel}
                      </span>
                      {form.costPricePaise > 0 && form.sellingPricePaise > 0 && (
                        <span
                          className={`ml-2 ${
                            marginPaise >= 0 ? 'text-status-success-fg' : 'text-status-danger-fg'
                          }`}
                        >
                          · Margin: <PriceText amountPaise={marginPaise} /> / {unitLabel} ({marginPct}%)
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPerUnitCalc((prev) => !prev)}
                      className="text-accent-primary font-medium hover:underline cursor-pointer"
                    >
                      {showPerUnitCalc ? 'Hide per-unit calculator' : `Calculate from bulk pack?`}
                    </button>
                  </div>

                  {(isWeightKg || isLitre) && form.sellingPricePaise > 0 && (
                    <div className="text-[11px] text-ink-secondary flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        1 {unitLabel}: <PriceText amountPaise={form.sellingPricePaise} className="font-semibold" />
                      </span>
                      <span>
                        500 {isWeightKg ? 'g' : 'ml'}:{' '}
                        <PriceText amountPaise={Math.round(form.sellingPricePaise * 0.5)} className="font-semibold" />
                      </span>
                      <span>
                        250 {isWeightKg ? 'g' : 'ml'}:{' '}
                        <PriceText amountPaise={Math.round(form.sellingPricePaise * 0.25)} className="font-semibold" />
                      </span>
                      <span>
                        100 {isWeightKg ? 'g' : 'ml'}:{' '}
                        <PriceText amountPaise={Math.round(form.sellingPricePaise * 0.1)} className="font-semibold" />
                      </span>
                    </div>
                  )}

                  {showPerUnitCalc && (
                    <div className="pt-2 border-t border-border-default grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                      <FormField label="Total Bag / Pack Price" htmlFor="calc-bag-price">
                        <MoneyInput
                          id="calc-bag-price"
                          valuePaise={bagPricePaise}
                          onChangePaise={setBagPricePaise}
                        />
                      </FormField>
                      <FormField label={`Total Qty in Bag (${unitLabel})`} htmlFor="calc-bag-qty">
                        <TextInput
                          id="calc-bag-qty"
                          type="number"
                          min={0.1}
                          step="0.5"
                          value={String(bagWeightQty)}
                          onChange={(e) => setBagWeightQty(Math.max(0.1, Number.parseFloat(e.target.value) || 1))}
                        />
                      </FormField>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={bagPricePaise <= 0 || bagWeightQty <= 0}
                        onClick={() => {
                          const perUnit = Math.round(bagPricePaise / bagWeightQty);
                          setForm((prev) => ({ ...prev, sellingPricePaise: perUnit }));
                          showToast({
                            tone: 'success',
                            message: `Selling price set to ₹${(perUnit / 100).toFixed(2)} per ${unitLabel}.`,
                          });
                        }}
                      >
                        Set as Price / {unitLabel}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <FormField label={`Stock Qty (${unitLabel})`} htmlFor="prod-stock">
                    <TextInput
                      id="prod-stock"
                      type="number"
                      step="0.01"
                      disabled={Boolean(form.id)}
                      value={String(form.stockQty)}
                      onChange={(e) => setForm({ ...form, stockQty: Number.parseFloat(e.target.value) || 0 })}
                    />
                  </FormField>
                  <FormField label={`Reorder Level (${unitLabel})`} htmlFor="prod-reorder">
                    <TextInput
                      id="prod-reorder"
                      type="number"
                      value={String(form.reorderLevel)}
                      onChange={(e) => setForm({ ...form, reorderLevel: Number.parseFloat(e.target.value) || 0 })}
                    />
                  </FormField>
                </div>
              </>
            );
          })()}

          {/* Auto-generated Barcode & Batch No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="Barcode (Auto-generated)"
              htmlFor="prod-barcode"
              hint="Auto-generated uniquely for your store if left blank."
            >
              <div className="flex gap-1.5">
                <TextInput
                  id="prod-barcode"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-label="Regenerate barcode"
                  onClick={() => setForm({ ...form, barcode: generateClientBarcode() })}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </FormField>
            <FormField
              label="Batch No (Auto-generated)"
              htmlFor="prod-batch"
              hint="Auto-generated batch identifier."
            >
              <div className="flex gap-1.5">
                <TextInput
                  id="prod-batch"
                  value={form.batchNo}
                  onChange={(e) => setForm({ ...form, batchNo: e.target.value })}
                  className="font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-label="Regenerate batch number"
                  onClick={() => setForm({ ...form, batchNo: generateClientBatchNo() })}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </FormField>
          </div>

          {/* Damaged Risk Tracking */}
          <div className="rounded-xl border border-border-default bg-surface-subtle/60 p-3 space-y-2.5">
            <div className="text-xs font-semibold text-ink-primary">Damaged Stock / Risk Note (Predict Module)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <FormField label="Damaged Qty" htmlFor="prod-dmg-qty">
                <TextInput
                  id="prod-dmg-qty"
                  type="number"
                  min={0}
                  step="0.1"
                  value={String(form.damagedQty)}
                  onChange={(e) =>
                    setForm({ ...form, damagedQty: Math.max(0, Number.parseFloat(e.target.value) || 0) })
                  }
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Damage / Risk Reason" htmlFor="prod-dmg-note">
                  <TextInput
                    id="prod-dmg-note"
                    value={form.damageNote}
                    onChange={(e) => setForm({ ...form, damageNote: e.target.value })}
                    placeholder="e.g. Torn bag, moisture risk, crushed carton"
                  />
                </FormField>
              </div>
            </div>
          </div>

          <ImageUploader
            label="Upload product image"
            value={form.imageUrl}
            onChange={(url) => setForm({ ...form, imageUrl: url })}
          />

          <p className="text-xs text-ink-muted">
            Single unified inventory: saved products automatically sync across offline POS billing and your online
            customer storefront.
          </p>
        </div>
      </Modal>

      {/* Master Catalogue Quick Add */}
      <Modal
        open={masterModalOpen}
        onClose={() => setMasterModalOpen(false)}
        title="Quick-Add from Master Catalogue"
      >
        <div className="space-y-2.5">
          {masterProducts.map((mp) => (
            <div
              key={mp.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-default p-3"
            >
              <div>
                <div className="text-sm font-semibold text-ink-primary">{mp.name}</div>
                <div className="text-xs text-ink-secondary">
                  {mp.categoryName} · {mp.brandName} · MRP <PriceText amountPaise={mp.mrpPaise} />
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  const unit = config?.units.find((u) => u.code === mp.unitCode) || config?.units[0];
                  const tax = config?.taxRates.find((t) => t.ratePercent === mp.taxRatePercent) || config?.taxRates[0];
                  setCategoryInlineMode('none');
                  setBrandInlineMode('none');
                  setForm({
                    ...emptyProductForm(),
                    name: mp.name,
                    barcode: mp.barcode || generateClientBarcode(),
                    batchNo: generateClientBatchNo(),
                    unitId: unit?.id || defaultUnitId,
                    taxRateId: tax?.id || defaultTaxId,
                    mrpPaise: mp.mrpPaise,
                    sellingPricePaise: mp.mrpPaise,
                    costPricePaise: Math.round(mp.mrpPaise * 0.8),
                    stockQty: 10,
                  });
                  setMasterModalOpen(false);
                  setProductModalOpen(true);
                }}
              >
                Use Template
              </Button>
            </div>
          ))}
        </div>
      </Modal>

      {/* Stock Operation Modal */}
      <Modal
        open={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        title="Stock Operation"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockModalOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={adjustStockMutation.isPending}
              disabled={!stockForm.productId || !stockForm.reason.trim()}
              onClick={() => adjustStockMutation.mutate()}
            >
              Save Movement
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Product" htmlFor="stk-prod">
            <Select
              id="stk-prod"
              value={stockForm.productId}
              onChange={(e) => setStockForm({ ...stockForm, productId: e.target.value })}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Now: {p.stockQty})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Operation Type" htmlFor="stk-type">
            <Select
              id="stk-type"
              value={stockForm.movementType}
              onChange={(e) => {
                const nextType = e.target.value as 'stock_in' | 'adjustment' | 'stock_take' | 'damaged';
                setStockForm({
                  ...stockForm,
                  movementType: nextType,
                  reason:
                    nextType === 'damaged'
                      ? 'Damaged / spoiled stock'
                      : nextType === 'stock_in'
                      ? 'Purchase stock-in'
                      : stockForm.reason,
                });
              }}
            >
              <option value="stock_in">Stock-In (Purchase)</option>
              <option value="adjustment">Adjustment (+/-)</option>
              <option value="stock_take">Stock Take (Set Counted Qty)</option>
              <option value="damaged">Damaged / Spoilage Risk</option>
            </Select>
          </FormField>
          {stockForm.movementType === 'stock_take' ? (
            <FormField label="Counted Physical Qty" htmlFor="stk-cnt">
              <TextInput
                id="stk-cnt"
                type="number"
                step="0.1"
                value={String(stockForm.countedQty)}
                onChange={(e) => setStockForm({ ...stockForm, countedQty: Number.parseFloat(e.target.value) || 0 })}
              />
            </FormField>
          ) : (
            <FormField
              label={stockForm.movementType === 'damaged' ? 'Damaged Units' : 'Qty Change'}
              htmlFor="stk-delta"
            >
              <TextInput
                id="stk-delta"
                type="number"
                step="0.1"
                value={String(stockForm.qtyDelta)}
                onChange={(e) => setStockForm({ ...stockForm, qtyDelta: Number.parseFloat(e.target.value) || 0 })}
              />
            </FormField>
          )}
          <FormField
            label={stockForm.movementType === 'damaged' ? 'Damage / Risk Note' : 'Reason'}
            htmlFor="stk-reason"
            required
          >
            <TextInput
              id="stk-reason"
              value={stockForm.reason}
              onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })}
            />
          </FormField>
          {stockForm.movementType === 'stock_in' && isOwner && (
            <div className="grid grid-cols-2 gap-2.5">
              <FormField label="Supplier" htmlFor="stk-sup">
                <Select
                  id="stk-sup"
                  value={stockForm.supplierId}
                  onChange={(e) => setStockForm({ ...stockForm, supplierId: e.target.value })}
                >
                  <option value="">None</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Invoice Cost" htmlFor="stk-cost">
                <MoneyInput
                  id="stk-cost"
                  valuePaise={stockForm.totalCostPaise}
                  onChangePaise={(v) => setStockForm({ ...stockForm, totalCostPaise: v })}
                />
              </FormField>
            </div>
          )}
        </div>
      </Modal>

      {/* Offer Creation Modal */}
      <Modal
        open={offerModalOpen}
        onClose={() => setOfferModalOpen(false)}
        title="Create Store Offer"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOfferModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!offerTitle.trim() || offerProductIds.length === 0}
              isLoading={createOfferMutation.isPending}
              onClick={() => createOfferMutation.mutate()}
            >
              Launch Offer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Offer Title" htmlFor="off-title" required>
            <TextInput
              id="off-title"
              value={offerTitle}
              onChange={(e) => setOfferTitle(e.target.value)}
              placeholder="e.g. Weekend 10% Off"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-2.5">
            <FormField label="Type" htmlFor="off-type">
              <Select
                id="off-type"
                value={offerType}
                onChange={(e) => setOfferType(e.target.value as 'percent' | 'flat' | 'combo' | 'bogo')}
              >
                <option value="percent">% Discount</option>
                <option value="flat">Flat Discount</option>
                <option value="combo">Combo</option>
                <option value="bogo">Buy 1 Get 1</option>
              </Select>
            </FormField>
            <FormField label={offerType === 'percent' ? 'Percent (%)' : 'Amount'} htmlFor="off-val">
              <TextInput
                id="off-val"
                type="number"
                value={String(offerValue)}
                onChange={(e) => setOfferValue(Number.parseFloat(e.target.value) || 0)}
              />
            </FormField>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-ink-primary">Apply to Products</span>
            <div className="max-h-40 overflow-y-auto space-y-1 border border-border-default rounded-lg p-2">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-xs text-ink-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={offerProductIds.includes(p.id)}
                    onChange={(e) =>
                      setOfferProductIds((prev) =>
                        e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                      )
                    }
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Excel Import Modal */}
      <Modal
        open={excelImportOpen}
        onClose={() => setExcelImportOpen(false)}
        title="Import Inventory from Excel (.xlsx / .xls / .csv)"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExcelImportOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={parsedImportRows.length === 0}
              isLoading={bulkImportMutation.isPending}
              onClick={() => bulkImportMutation.mutate()}
            >
              Import {parsedImportRows.length > 0 ? `${parsedImportRows.length} Row(s)` : 'Rows'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-border-default bg-surface-subtle p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-ink-primary inline-flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-accent-primary" /> Desired Excel Column Headers
              </div>
              <Button size="sm" variant="secondary" onClick={handleDownloadSampleTemplate}>
                <Download className="h-3.5 w-3.5" /> Download Sample Template (.xlsx)
              </Button>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              <span className="font-mono text-ink-primary">
                Product Name, Category, Brand, Unit, Tax Rate (%), MRP, Selling Price, Cost Price, Stock Qty, Reorder
                Level, Barcode, Batch No, Damaged Qty, Damage Note, Description
              </span>
            </p>
            <p className="text-[11px] text-ink-muted">
              Blank Barcode or Batch No cells will be auto-generated uniquely for your store. New Categories and Brands
              are created exclusively under your store.
            </p>
          </div>

          <div>
            <label
              htmlFor="excel-file-input"
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-strong bg-surface-card p-5 text-center cursor-pointer hover:border-accent-primary transition-colors"
            >
              <Upload className="h-6 w-6 text-accent-primary mb-1.5" />
              <span className="text-sm font-medium text-ink-primary">
                {excelFileName || 'Choose an Excel (.xlsx, .xls) or CSV file'}
              </span>
              <span className="text-xs text-ink-muted mt-0.5">Click to browse from your computer</span>
              <input
                id="excel-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => void handleExcelFileSelected(e.target.files?.[0])}
              />
            </label>
          </div>

          {excelParseError && <p className="text-xs text-status-danger-fg font-medium">{excelParseError}</p>}

          {parsedImportRows.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-ink-primary">
                Preview ({parsedImportRows.length} ready to import)
              </div>
              <div className="max-h-52 overflow-auto rounded-lg border border-border-default">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-ink-secondary border-b border-border-default">
                    <tr>
                      <th className="px-2.5 py-2">Product Name</th>
                      <th className="px-2.5 py-2">Category</th>
                      <th className="px-2.5 py-2">Brand</th>
                      <th className="px-2.5 py-2">Selling</th>
                      <th className="px-2.5 py-2">Stock</th>
                      <th className="px-2.5 py-2">Barcode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {parsedImportRows.slice(0, 8).map((r, idx) => (
                      <tr key={`${r.name}-${idx}`}>
                        <td className="px-2.5 py-1.5 font-medium text-ink-primary">{r.name}</td>
                        <td className="px-2.5 py-1.5 text-ink-secondary">{r.categoryName || '—'}</td>
                        <td className="px-2.5 py-1.5 text-ink-secondary">{r.brandName || '—'}</td>
                        <td className="px-2.5 py-1.5 font-mono">{r.sellingPrice}</td>
                        <td className="px-2.5 py-1.5 font-mono">{r.stockQty ?? 0}</td>
                        <td className="px-2.5 py-1.5 font-mono text-ink-muted">{r.barcode || 'Auto'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete / Archive Item Confirmation Alert */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Are you sure?"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}" from active inventory? It will be hidden from POS and your online store, and can be restored from Archived items anytime.`
            : ''
        }
        confirmLabel="Yes, Delete Item"
        variant="danger"
        isLoading={archiveMutation.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          archiveMutation.mutate(
            { id: deleteTarget.id, archive: true },
            {
              onSuccess: () => setDeleteTarget(null),
            }
          );
        }}
      />
    </div>
  );
}
