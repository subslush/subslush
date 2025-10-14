--
-- PostgreSQL database dump
--

\restrict J5NYjMYvOsF3XRVpghgLGt86BfAHGdhdfQU7SmcJRzKte6ScBKMmQy6hAJa4dEr

-- Dumped from database version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: subscription_user
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO subscription_user;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: update_credit_transaction_timestamp(); Type: FUNCTION; Schema: public; Owner: subscription_user
--

CREATE FUNCTION public.update_credit_transaction_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_credit_transaction_timestamp() OWNER TO subscription_user;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: subscription_user
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO subscription_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_tasks; Type: TABLE; Schema: public; Owner: subscription_user
--

CREATE TABLE public.admin_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    task_type character varying(50) NOT NULL,
    due_date timestamp without time zone NOT NULL,
    completed_at timestamp without time zone,
    assigned_admin uuid,
    notes text,
    priority character varying(10) DEFAULT 'medium'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT admin_tasks_completion_check CHECK (((completed_at IS NULL) OR (completed_at >= created_at))),
    CONSTRAINT admin_tasks_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT admin_tasks_type_check CHECK (((task_type)::text = ANY ((ARRAY['credential_provision'::character varying, 'renewal'::character varying, 'cancellation'::character varying, 'support'::character varying, 'verification'::character varying])::text[])))
);


ALTER TABLE public.admin_tasks OWNER TO subscription_user;

--
-- Name: TABLE admin_tasks; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON TABLE public.admin_tasks IS 'Manages manual administrative tasks requiring human intervention';


--
-- Name: COLUMN admin_tasks.assigned_admin; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.admin_tasks.assigned_admin IS 'Admin user responsible for completing the task';


--
-- Name: COLUMN admin_tasks.priority; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.admin_tasks.priority IS 'Task priority level for queue management';


--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: subscription_user
--

CREATE TABLE public.credit_transactions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    type character varying(20) NOT NULL,
    amount numeric(10,2) NOT NULL,
    balance_before numeric(10,2) DEFAULT 0 NOT NULL,
    balance_after numeric(10,2) DEFAULT 0 NOT NULL,
    description text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_id character varying(100),
    payment_provider character varying(20) DEFAULT 'nowpayments'::character varying,
    payment_status character varying(20),
    payment_currency character varying(10),
    payment_amount numeric(18,8),
    blockchain_hash character varying(100),
    monitoring_status character varying(20) DEFAULT 'pending'::character varying,
    last_monitored_at timestamp without time zone,
    retry_count integer DEFAULT 0,
    CONSTRAINT credit_transactions_monitoring_status_check CHECK (((monitoring_status)::text = ANY ((ARRAY['pending'::character varying, 'monitoring'::character varying, 'completed'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[]))),
    CONSTRAINT credit_transactions_payment_provider_check CHECK (((payment_provider)::text = ANY ((ARRAY['nowpayments'::character varying, 'manual'::character varying, 'admin'::character varying])::text[]))),
    CONSTRAINT credit_transactions_payment_status_check CHECK (((payment_status IS NULL) OR ((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'waiting'::character varying, 'confirming'::character varying, 'confirmed'::character varying, 'sending'::character varying, 'partially_paid'::character varying, 'finished'::character varying, 'failed'::character varying, 'refunded'::character varying, 'expired'::character varying])::text[])))),
    CONSTRAINT credit_transactions_type_check CHECK (((type)::text = ANY ((ARRAY['deposit'::character varying, 'purchase'::character varying, 'refund'::character varying, 'bonus'::character varying, 'withdrawal'::character varying])::text[])))
);


ALTER TABLE public.credit_transactions OWNER TO subscription_user;

--
-- Name: TABLE credit_transactions; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON TABLE public.credit_transactions IS 'Stores all credit transactions for the platform with balance tracking';


--
-- Name: COLUMN credit_transactions.amount; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.amount IS 'Transaction amount - positive for credits added, negative for credits spent';


--
-- Name: COLUMN credit_transactions.balance_before; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.balance_before IS 'User balance before this transaction';


--
-- Name: COLUMN credit_transactions.balance_after; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.balance_after IS 'User balance after this transaction';


--
-- Name: COLUMN credit_transactions.metadata; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.metadata IS 'Additional transaction metadata stored as JSON';


--
-- Name: COLUMN credit_transactions.payment_id; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.payment_id IS 'NOWPayments payment ID or external reference';


--
-- Name: COLUMN credit_transactions.payment_provider; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.payment_provider IS 'Payment provider: nowpayments, manual, admin';


--
-- Name: COLUMN credit_transactions.payment_status; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.payment_status IS 'NOWPayments payment status';


--
-- Name: COLUMN credit_transactions.payment_currency; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.payment_currency IS 'Cryptocurrency used for payment (BTC, ETH, etc.)';


--
-- Name: COLUMN credit_transactions.payment_amount; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.payment_amount IS 'Amount paid in cryptocurrency';


--
-- Name: COLUMN credit_transactions.blockchain_hash; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.blockchain_hash IS 'Blockchain transaction hash for verification';


--
-- Name: COLUMN credit_transactions.monitoring_status; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.monitoring_status IS 'Status of payment monitoring process';


--
-- Name: COLUMN credit_transactions.last_monitored_at; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.last_monitored_at IS 'Timestamp of last monitoring check';


--
-- Name: COLUMN credit_transactions.retry_count; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credit_transactions.retry_count IS 'Number of monitoring retry attempts';


--
-- Name: credits; Type: TABLE; Schema: public; Owner: subscription_user
--

CREATE TABLE public.credits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    transaction_type character varying(20) NOT NULL,
    transaction_hash character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    description text,
    CONSTRAINT credits_amount_positive_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT credits_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['deposit'::character varying, 'purchase'::character varying, 'refund'::character varying, 'bonus'::character varying, 'withdrawal'::character varying])::text[])))
);


ALTER TABLE public.credits OWNER TO subscription_user;

--
-- Name: TABLE credits; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON TABLE public.credits IS 'Tracks all credit transactions including crypto deposits and subscription purchases';


--
-- Name: COLUMN credits.amount; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credits.amount IS 'Transaction amount in USD (positive values only)';


--
-- Name: COLUMN credits.transaction_hash; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.credits.transaction_hash IS 'Blockchain transaction hash for cryptocurrency deposits';


--
-- Name: payment_refunds; Type: TABLE; Schema: public; Owner: subscription_user
--

CREATE TABLE public.payment_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id character varying(100) NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(18,8) NOT NULL,
    reason character varying(50) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    approved_by uuid,
    processed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT payment_refunds_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_refunds_reason_check CHECK (((reason)::text = ANY ((ARRAY['user_request'::character varying, 'payment_error'::character varying, 'service_issue'::character varying, 'overpayment'::character varying, 'admin_decision'::character varying, 'dispute'::character varying])::text[]))),
    CONSTRAINT payment_refunds_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.payment_refunds OWNER TO subscription_user;

--
-- Name: TABLE payment_refunds; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON TABLE public.payment_refunds IS 'Tracks refund requests and their processing status';


--
-- Name: COLUMN payment_refunds.payment_id; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.payment_refunds.payment_id IS 'Reference to the original payment ID';


--
-- Name: COLUMN payment_refunds.amount; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.payment_refunds.amount IS 'Amount to be refunded in USD';


--
-- Name: COLUMN payment_refunds.reason; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.payment_refunds.reason IS 'Reason for the refund request';


--
-- Name: COLUMN payment_refunds.status; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.payment_refunds.status IS 'Current status of the refund request';


--
-- Name: COLUMN payment_refunds.approved_by; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.payment_refunds.approved_by IS 'Admin user who approved/rejected the refund';


--
-- Name: COLUMN payment_refunds.metadata; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.payment_refunds.metadata IS 'Additional refund processing metadata';


--
-- Name: payment_monitoring_dashboard; Type: VIEW; Schema: public; Owner: subscription_user
--

CREATE VIEW public.payment_monitoring_dashboard AS
 SELECT payment_id,
    user_id,
    payment_status,
    monitoring_status,
    payment_currency,
    payment_amount,
    retry_count,
    last_monitored_at,
    created_at AS payment_created_at,
    updated_at AS last_updated,
        CASE
            WHEN ((payment_status)::text = ANY ((ARRAY['finished'::character varying, 'failed'::character varying, 'expired'::character varying, 'refunded'::character varying])::text[])) THEN 'final'::text
            WHEN (last_monitored_at < (now() - '01:00:00'::interval)) THEN 'stale'::text
            WHEN (retry_count >= 3) THEN 'high_retry'::text
            ELSE 'normal'::text
        END AS monitoring_priority,
    (EXISTS ( SELECT 1
           FROM public.payment_refunds pr
          WHERE ((pr.payment_id)::text = (ct.payment_id)::text))) AS has_refund_request
   FROM public.credit_transactions ct
  WHERE (payment_id IS NOT NULL)
  ORDER BY
        CASE
            WHEN ((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'waiting'::character varying, 'confirming'::character varying, 'confirmed'::character varying, 'sending'::character varying, 'partially_paid'::character varying])::text[])) THEN 1
            ELSE 2
        END, retry_count DESC, last_monitored_at NULLS FIRST;


ALTER VIEW public.payment_monitoring_dashboard OWNER TO subscription_user;

--
-- Name: refund_management_dashboard; Type: VIEW; Schema: public; Owner: subscription_user
--

CREATE VIEW public.refund_management_dashboard AS
 SELECT pr.id AS refund_id,
    pr.payment_id,
    pr.user_id,
    pr.amount,
    pr.reason,
    pr.status,
    pr.created_at AS requested_at,
    pr.approved_by,
    pr.processed_at,
    ct.payment_status,
    ct.payment_amount AS original_payment_amount,
    ct.payment_currency,
    (EXTRACT(epoch FROM (now() - (pr.created_at)::timestamp with time zone)) / (3600)::numeric) AS hours_pending,
        CASE
            WHEN (((pr.status)::text = 'pending'::text) AND (pr.created_at < (now() - '24:00:00'::interval))) THEN 'urgent'::text
            WHEN (((pr.status)::text = 'pending'::text) AND (pr.created_at < (now() - '04:00:00'::interval))) THEN 'attention'::text
            ELSE 'normal'::text
        END AS priority_level
   FROM (public.payment_refunds pr
     LEFT JOIN public.credit_transactions ct ON (((ct.payment_id)::text = (pr.payment_id)::text)))
  ORDER BY
        CASE pr.status
            WHEN 'pending'::text THEN 1
            WHEN 'approved'::text THEN 2
            WHEN 'processing'::text THEN 3
            ELSE 4
        END, pr.created_at DESC;


ALTER VIEW public.refund_management_dashboard OWNER TO subscription_user;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: subscription_user
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    version character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    applied_at timestamp without time zone DEFAULT now(),
    execution_time_ms integer,
    checksum character varying(64),
    applied_by character varying(100) DEFAULT CURRENT_USER
);


ALTER TABLE public.schema_migrations OWNER TO subscription_user;

--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON TABLE public.schema_migrations IS 'Tracks database schema migration history';


--
-- Name: COLUMN schema_migrations.version; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.schema_migrations.version IS 'Migration timestamp in YYYYMMDD_HHMMSS format';


--
-- Name: COLUMN schema_migrations.checksum; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.schema_migrations.checksum IS 'SHA-256 hash of migration content for integrity verification';


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: subscription_user
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.schema_migrations_id_seq OWNER TO subscription_user;

--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: subscription_user
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: subscription_user
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    service_type character varying(50) NOT NULL,
    service_plan character varying(50) NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    renewal_date timestamp without time zone NOT NULL,
    credentials_encrypted text,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT subscriptions_date_order_check CHECK ((start_date <= end_date)),
    CONSTRAINT subscriptions_renewal_check CHECK ((renewal_date >= start_date)),
    CONSTRAINT subscriptions_service_plan_check CHECK (((service_plan)::text = ANY ((ARRAY['premium'::character varying, 'family'::character varying, 'individual'::character varying, 'basic'::character varying, 'standard'::character varying, 'pro'::character varying])::text[]))),
    CONSTRAINT subscriptions_service_type_check CHECK (((service_type)::text = ANY ((ARRAY['spotify'::character varying, 'netflix'::character varying, 'tradingview'::character varying])::text[]))),
    CONSTRAINT subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'cancelled'::character varying, 'pending'::character varying])::text[])))
);


ALTER TABLE public.subscriptions OWNER TO subscription_user;

--
-- Name: TABLE subscriptions; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON TABLE public.subscriptions IS 'Stores subscription details for streaming and trading services';


--
-- Name: COLUMN subscriptions.credentials_encrypted; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.subscriptions.credentials_encrypted IS 'Encrypted login credentials provided by admin';


--
-- Name: COLUMN subscriptions.metadata; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.subscriptions.metadata IS 'Service-specific configuration and settings in JSON format';


--
-- Name: user_credit_balances; Type: VIEW; Schema: public; Owner: subscription_user
--

CREATE VIEW public.user_credit_balances AS
 SELECT user_id,
    COALESCE(sum(amount), (0)::numeric) AS total_balance,
    COALESCE(sum(
        CASE
            WHEN (amount > (0)::numeric) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS total_credits_added,
    COALESCE(abs(sum(
        CASE
            WHEN (amount < (0)::numeric) THEN amount
            ELSE (0)::numeric
        END)), (0)::numeric) AS total_credits_spent,
    count(*) AS transaction_count,
    max(created_at) AS last_transaction_date,
    min(created_at) AS first_transaction_date
   FROM public.credit_transactions
  GROUP BY user_id;


ALTER VIEW public.user_credit_balances OWNER TO subscription_user;

--
-- Name: VIEW user_credit_balances; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON VIEW public.user_credit_balances IS 'Aggregated view of user credit balances and statistics';


--
-- Name: users; Type: TABLE; Schema: public; Owner: subscription_user
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    last_login timestamp without time zone,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    display_name character varying(100),
    user_timezone character varying(50),
    language_preference character varying(10),
    notification_preferences jsonb DEFAULT '{}'::jsonb,
    profile_updated_at timestamp without time zone DEFAULT now(),
    first_name character varying(100),
    last_name character varying(100),
    CONSTRAINT users_email_format_check CHECK (((email)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'suspended'::character varying, 'deleted'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO subscription_user;

--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON TABLE public.users IS 'Stores user account information and authentication status';


--
-- Name: COLUMN users.email; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.users.email IS 'Unique email address for user login';


--
-- Name: COLUMN users.status; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.users.status IS 'User account status: active, inactive, suspended, deleted';


--
-- Name: COLUMN users.display_name; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.users.display_name IS 'User preferred display name for UI';


--
-- Name: COLUMN users.user_timezone; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.users.user_timezone IS 'User timezone preference for date/time display';


--
-- Name: COLUMN users.language_preference; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.users.language_preference IS 'User language preference for UI';


--
-- Name: COLUMN users.notification_preferences; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.users.notification_preferences IS 'User notification settings in JSON format';


--
-- Name: COLUMN users.profile_updated_at; Type: COMMENT; Schema: public; Owner: subscription_user
--

COMMENT ON COLUMN public.users.profile_updated_at IS 'Timestamp of last profile update';


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);


--
-- Data for Name: admin_tasks; Type: TABLE DATA; Schema: public; Owner: subscription_user
--

COPY public.admin_tasks (id, subscription_id, task_type, due_date, completed_at, assigned_admin, notes, priority, created_at) FROM stdin;
\.


--
-- Data for Name: credit_transactions; Type: TABLE DATA; Schema: public; Owner: subscription_user
--

COPY public.credit_transactions (id, user_id, type, amount, balance_before, balance_after, description, metadata, created_at, updated_at, payment_id, payment_provider, payment_status, payment_currency, payment_amount, blockchain_hash, monitoring_status, last_monitored_at, retry_count) FROM stdin;
b1199b0a-1a83-4116-96f6-0114320548ea	75076db1-cc73-4c30-9ce5-c961df34f5bd	deposit	200.00	0.00	200.00	Test credits for subscription testing	{"original_id": "567a77b5-110b-4342-841b-674964e86266", "migrated_from": "credits_table", "migration_date": "2025-10-02 22:43:46.430955+02", "original_transaction_hash": null}	2025-10-02 22:35:50.715268+02	2025-10-02 22:43:46.430955+02	\N	manual	\N	\N	\N	\N	completed	\N	0
94d85d2c-abf1-4cc3-96f3-831786a53f02	11111111-1111-1111-1111-111111111111	deposit	100.00	0.00	100.00	Initial deposit	{"test": true}	2025-10-03 13:36:08.712429+02	2025-10-03 13:36:08.712429+02	\N	manual	\N	\N	\N	\N	completed	\N	0
93b1b8a6-e0da-43b3-886b-a19f7ced2a55	11111111-1111-1111-1111-111111111111	purchase	-25.00	100.00	75.00	Test purchase	{"item": "spotify_premium", "test": true}	2025-10-03 13:36:08.712429+02	2025-10-03 13:36:08.712429+02	\N	manual	\N	\N	\N	\N	completed	\N	0
ac939341-3f1e-4241-bbb6-d84a63fcdc3a	11111111-1111-1111-1111-111111111111	bonus	15.00	75.00	90.00	Referral bonus	{"test": true, "referral_id": "ref123"}	2025-10-03 13:36:08.712429+02	2025-10-03 13:36:08.712429+02	\N	manual	\N	\N	\N	\N	completed	\N	0
667c195d-1293-48af-b9ef-e319d5387814	11111111-1111-1111-1111-111111111111	refund	10.00	90.00	100.00	Purchase refund	{"test": true, "original_purchase_id": "purchase123"}	2025-10-03 13:36:08.712429+02	2025-10-03 13:36:08.712429+02	\N	manual	\N	\N	\N	\N	completed	\N	0
82260f20-e7c5-40ea-b70f-b5f693848716	22222222-2222-2222-2222-222222222222	deposit	500.00	0.00	500.00	Large initial deposit	{"test": true}	2025-10-03 13:36:08.712429+02	2025-10-03 13:36:08.712429+02	\N	manual	\N	\N	\N	\N	completed	\N	0
f5229918-5fa9-406d-8763-4f8cf647c0d1	22222222-2222-2222-2222-222222222222	purchase	-50.00	500.00	450.00	Netflix subscription	{"test": true, "service": "netflix"}	2025-10-03 13:36:08.712429+02	2025-10-03 13:36:08.712429+02	\N	manual	\N	\N	\N	\N	completed	\N	0
12482686-10a2-4dc0-a79e-db43bdc17f8d	22222222-2222-2222-2222-222222222222	purchase	-30.00	450.00	420.00	TradingView subscription	{"test": true, "service": "tradingview"}	2025-10-03 13:36:08.712429+02	2025-10-03 13:36:08.712429+02	\N	manual	\N	\N	\N	\N	completed	\N	0
\.


--
-- Data for Name: credits; Type: TABLE DATA; Schema: public; Owner: subscription_user
--

COPY public.credits (id, user_id, amount, transaction_type, transaction_hash, created_at, description) FROM stdin;
567a77b5-110b-4342-841b-674964e86266	75076db1-cc73-4c30-9ce5-c961df34f5bd	200.00	deposit	\N	2025-10-02 22:35:50.715268	Test credits for subscription testing
\.


--
-- Data for Name: payment_refunds; Type: TABLE DATA; Schema: public; Owner: subscription_user
--

COPY public.payment_refunds (id, payment_id, user_id, amount, reason, description, status, approved_by, processed_at, created_at, updated_at, metadata) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: subscription_user
--

COPY public.schema_migrations (id, version, name, applied_at, execution_time_ms, checksum, applied_by) FROM stdin;
1	20241219_120000	initial schema	2025-09-19 21:32:07.408393	0	manual_application	manual
3	20241219_120001	add performance indexes	2025-09-19 21:34:43.965013	0	manual_application	manual
5	20250925_120000	add_payment_tracking.sql	2025-09-25 13:05:58.661919	100	manual_application	subscription_user
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: subscription_user
--

COPY public.subscriptions (id, user_id, service_type, service_plan, start_date, end_date, renewal_date, credentials_encrypted, status, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: subscription_user
--

COPY public.users (id, email, created_at, last_login, status, display_name, user_timezone, language_preference, notification_preferences, profile_updated_at, first_name, last_name) FROM stdin;
241b12f7-de22-4d25-8f31-aca7dd061b08	user1758483609597@testdomain.com	2025-09-21 19:40:09.126255	\N	active	\N	\N	\N	{}	2025-09-23 20:02:40.170628	\N	\N
c6f70530-69de-4d95-bf69-e5c2a807e1c3	test@example.com	2025-09-21 23:19:43.828453	2025-09-22 01:19:56.540845	active	\N	\N	\N	{}	2025-09-23 20:02:40.170628	\N	\N
a04f609f-6772-4856-bc77-a14be62e38ac	test1@example.com	2025-09-22 00:22:27.036332	2025-09-22 02:22:43.623228	active	\N	\N	\N	{}	2025-09-23 20:02:40.170628	\N	\N
b6043550-54c8-4b5f-819f-20102a7dc912	test.verification@example.com	2025-09-22 11:38:25.052256	2025-09-22 13:41:08.801785	active	\N	\N	\N	{}	2025-09-23 20:02:40.170628	\N	\N
e0127505-07be-4ae6-82e9-38e08cfac274	fix_test@example.com	2025-09-23 18:52:42.424	2025-09-23 18:58:08.525731	active	\N	\N	\N	{}	2025-09-23 20:02:40.170628	\N	\N
fba6ecc2-8f16-49d9-844d-7965fa1982a0	test-1758653106906@example.com	2025-09-23 20:45:07.241	\N	active	Updated Profile Test	America/New_York	en-US	{"sms": true, "push": false, "email": true, "marketing": false}	2025-09-23 20:45:07.482538	\N	\N
0a88775e-5008-4803-ba6a-c6696b8c76c4	test@testexample.com	2025-09-23 19:03:17.936	2025-09-23 20:55:57.786476	active	Updated Name	America/New_York	en	{"push": false, "email": true, "marketing": true}	2025-09-23 20:56:35.575851	\N	\N
e9fbea9a-ed72-402f-bb9f-c856eb6167c6	testyuri@example.com	2025-09-25 19:04:51.457	\N	active	\N	\N	\N	{}	2025-09-25 19:04:51.707168	\N	\N
3f8c4776-451f-40d3-9f7e-5867b830f10b	testyuri123@example.com	2025-09-25 19:31:02.868	\N	active	\N	\N	\N	{}	2025-09-25 19:31:03.023187	\N	\N
8f7d8327-0c1b-4cd9-b76f-ce9929453e00	testyuri123@example123.com	2025-09-25 19:49:02.844	\N	active	\N	\N	\N	{}	2025-09-25 19:49:02.96731	\N	\N
ad710e97-00b3-4dfc-9e13-3c1b88b34061	testawdawd@example.com	2025-09-26 06:58:59.524	\N	active	\N	\N	\N	{}	2025-09-26 06:58:59.828801	\N	\N
9ba75e06-c790-4273-a688-346e5867953a	testawdawd@exampletest.com	2025-09-26 07:18:24.019	\N	active	\N	\N	\N	{}	2025-09-26 07:18:24.215462	\N	\N
32f18ccb-645a-4f7e-83a7-29a6bd03e529	testuser34@example.com	2025-09-26 13:26:05.06	\N	active	\N	\N	\N	{}	2025-09-26 13:26:05.372769	\N	\N
367a0e06-67af-43cd-9c0d-a08406281822	testuser35@example.com	2025-09-26 15:37:40.71	\N	active	\N	\N	\N	{}	2025-09-26 15:37:41.002508	\N	\N
932a762a-cd20-4047-8c8f-e39ad2c2357f	testuser36@example.com	2025-09-26 17:55:37.493	\N	active	\N	\N	\N	{}	2025-09-26 17:55:37.77731	\N	\N
8992dc63-8360-4724-b94a-9d5d006d6f56	johndoe@doe.com	2025-09-29 19:00:32.227	2025-09-29 19:00:46.670219	active	\N	\N	\N	{}	2025-09-29 19:00:32.564363	\N	\N
75076db1-cc73-4c30-9ce5-c961df34f5bd	test1a24@example.com	2025-09-29 20:28:02.359	2025-10-02 22:30:11.065334	active	\N	\N	\N	{}	2025-09-29 20:28:02.613194	Johnny	Doey
5fbea452-b3c6-4441-b06b-a9d2bd678a0b	teete123@tete.com	2025-09-29 20:51:47.289	\N	active	\N	\N	\N	{}	2025-09-29 20:51:47.356277	\N	\N
11111111-1111-1111-1111-111111111111	test1_f87b650d-85f0-4b2a-9410-0c804209acc4@example.com	2025-10-03 13:36:08.712429	\N	active	\N	\N	\N	{}	2025-10-03 13:36:08.712429	\N	\N
22222222-2222-2222-2222-222222222222	test2_d9d4a73c-2ce5-4152-86a3-b86c8d9bda47@example.com	2025-10-03 13:36:08.712429	\N	active	\N	\N	\N	{}	2025-10-03 13:36:08.712429	\N	\N
542118ac-5c20-47b7-81fc-bc6323d44d37	test512a@example.com	2025-09-29 21:28:08.594	\N	active	\N	\N	\N	{}	2025-09-29 21:28:08.711635	\N	\N
139f41a9-7dff-4677-a43f-a4a181a32a67	testa123@example.com	2025-09-29 22:06:28.632	\N	active	\N	\N	\N	{}	2025-09-29 22:06:28.745138	\N	\N
\.


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: subscription_user
--

SELECT pg_catalog.setval('public.schema_migrations_id_seq', 5, true);


--
-- Name: admin_tasks admin_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.admin_tasks
    ADD CONSTRAINT admin_tasks_pkey PRIMARY KEY (id);


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: credits credits_pkey; Type: CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.credits
    ADD CONSTRAINT credits_pkey PRIMARY KEY (id);


--
-- Name: payment_refunds payment_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_version_key; Type: CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_version_key UNIQUE (version);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_admin_tasks_assigned_admin; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_admin_tasks_assigned_admin ON public.admin_tasks USING btree (assigned_admin);


--
-- Name: idx_admin_tasks_due_date; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_admin_tasks_due_date ON public.admin_tasks USING btree (due_date);


--
-- Name: idx_admin_tasks_incomplete; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_admin_tasks_incomplete ON public.admin_tasks USING btree (due_date) WHERE (completed_at IS NULL);


--
-- Name: idx_admin_tasks_priority; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_admin_tasks_priority ON public.admin_tasks USING btree (priority);


--
-- Name: idx_admin_tasks_subscription_id; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_admin_tasks_subscription_id ON public.admin_tasks USING btree (subscription_id);


--
-- Name: idx_admin_tasks_task_type; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_admin_tasks_task_type ON public.admin_tasks USING btree (task_type);


--
-- Name: idx_credit_transactions_balance_calculation; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_balance_calculation ON public.credit_transactions USING btree (user_id, amount, created_at);


--
-- Name: idx_credit_transactions_blockchain_hash; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_blockchain_hash ON public.credit_transactions USING btree (blockchain_hash);


--
-- Name: idx_credit_transactions_created_at; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_created_at ON public.credit_transactions USING btree (created_at DESC);


--
-- Name: idx_credit_transactions_last_monitored_at; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_last_monitored_at ON public.credit_transactions USING btree (last_monitored_at);


--
-- Name: idx_credit_transactions_monitoring_status; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_monitoring_status ON public.credit_transactions USING btree (monitoring_status);


--
-- Name: idx_credit_transactions_payment_id; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_payment_id ON public.credit_transactions USING btree (payment_id);


--
-- Name: idx_credit_transactions_payment_monitoring; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_payment_monitoring ON public.credit_transactions USING btree (payment_status, monitoring_status, last_monitored_at) WHERE (payment_id IS NOT NULL);


--
-- Name: idx_credit_transactions_payment_provider; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_payment_provider ON public.credit_transactions USING btree (payment_provider);


--
-- Name: idx_credit_transactions_payment_status; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_payment_status ON public.credit_transactions USING btree (payment_status);


--
-- Name: idx_credit_transactions_pending_payments; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_pending_payments ON public.credit_transactions USING btree (payment_id, payment_status, created_at) WHERE ((payment_id IS NOT NULL) AND ((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'waiting'::character varying, 'confirming'::character varying, 'confirmed'::character varying, 'sending'::character varying, 'partially_paid'::character varying])::text[])));


--
-- Name: idx_credit_transactions_retry_count; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_retry_count ON public.credit_transactions USING btree (retry_count);


--
-- Name: idx_credit_transactions_type; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_type ON public.credit_transactions USING btree (type);


--
-- Name: idx_credit_transactions_user_id; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions USING btree (user_id);


--
-- Name: idx_credit_transactions_user_id_created_at; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_user_id_created_at ON public.credit_transactions USING btree (user_id, created_at DESC);


--
-- Name: idx_credit_transactions_user_id_type; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_user_id_type ON public.credit_transactions USING btree (user_id, type);


--
-- Name: idx_credit_transactions_user_id_type_created_at; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credit_transactions_user_id_type_created_at ON public.credit_transactions USING btree (user_id, type, created_at DESC);


--
-- Name: idx_credits_created_at; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credits_created_at ON public.credits USING btree (created_at);


--
-- Name: idx_credits_transaction_hash; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credits_transaction_hash ON public.credits USING btree (transaction_hash) WHERE (transaction_hash IS NOT NULL);


--
-- Name: idx_credits_transaction_type; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credits_transaction_type ON public.credits USING btree (transaction_type);


--
-- Name: idx_credits_user_id; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_credits_user_id ON public.credits USING btree (user_id);


--
-- Name: idx_payment_refunds_approved_by; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_payment_refunds_approved_by ON public.payment_refunds USING btree (approved_by);


--
-- Name: idx_payment_refunds_created_at; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_payment_refunds_created_at ON public.payment_refunds USING btree (created_at);


--
-- Name: idx_payment_refunds_payment_id; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_payment_refunds_payment_id ON public.payment_refunds USING btree (payment_id);


--
-- Name: idx_payment_refunds_status; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_payment_refunds_status ON public.payment_refunds USING btree (status);


--
-- Name: idx_payment_refunds_user_id; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_payment_refunds_user_id ON public.payment_refunds USING btree (user_id);


--
-- Name: idx_schema_migrations_applied_at; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_schema_migrations_applied_at ON public.schema_migrations USING btree (applied_at);


--
-- Name: idx_schema_migrations_version; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_schema_migrations_version ON public.schema_migrations USING btree (version);


--
-- Name: idx_subscriptions_end_date; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_subscriptions_end_date ON public.subscriptions USING btree (end_date);


--
-- Name: idx_subscriptions_renewal_date; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_subscriptions_renewal_date ON public.subscriptions USING btree (renewal_date);


--
-- Name: idx_subscriptions_service_plan; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_subscriptions_service_plan ON public.subscriptions USING btree (service_type, service_plan);


--
-- Name: idx_subscriptions_service_type; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_subscriptions_service_type ON public.subscriptions USING btree (service_type);


--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);


--
-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_users_created_at ON public.users USING btree (created_at);


--
-- Name: idx_users_display_name; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_users_display_name ON public.users USING btree (display_name) WHERE (display_name IS NOT NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_language_preference; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_users_language_preference ON public.users USING btree (language_preference) WHERE (language_preference IS NOT NULL);


--
-- Name: idx_users_name; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_users_name ON public.users USING btree (first_name, last_name);


--
-- Name: idx_users_profile_updated_at; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_users_profile_updated_at ON public.users USING btree (profile_updated_at);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_user_timezone; Type: INDEX; Schema: public; Owner: subscription_user
--

CREATE INDEX idx_users_user_timezone ON public.users USING btree (user_timezone) WHERE (user_timezone IS NOT NULL);


--
-- Name: credit_transactions trigger_update_credit_transaction_timestamp; Type: TRIGGER; Schema: public; Owner: subscription_user
--

CREATE TRIGGER trigger_update_credit_transaction_timestamp BEFORE UPDATE ON public.credit_transactions FOR EACH ROW EXECUTE FUNCTION public.update_credit_transaction_timestamp();


--
-- Name: payment_refunds update_payment_refunds_updated_at; Type: TRIGGER; Schema: public; Owner: subscription_user
--

CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON public.payment_refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admin_tasks admin_tasks_assigned_admin_fkey; Type: FK CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.admin_tasks
    ADD CONSTRAINT admin_tasks_assigned_admin_fkey FOREIGN KEY (assigned_admin) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: admin_tasks admin_tasks_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.admin_tasks
    ADD CONSTRAINT admin_tasks_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: credits credits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.credits
    ADD CONSTRAINT credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: credit_transactions fk_credit_transactions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT fk_credit_transactions_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_refunds payment_refunds_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: payment_refunds payment_refunds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: subscription_user
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: TABLE payment_monitoring_dashboard; Type: ACL; Schema: public; Owner: subscription_user
--

GRANT SELECT ON TABLE public.payment_monitoring_dashboard TO PUBLIC;


--
-- Name: TABLE refund_management_dashboard; Type: ACL; Schema: public; Owner: subscription_user
--

GRANT SELECT ON TABLE public.refund_management_dashboard TO PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict J5NYjMYvOsF3XRVpghgLGt86BfAHGdhdfQU7SmcJRzKte6ScBKMmQy6hAJa4dEr

