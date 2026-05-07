DO $$
BEGIN
  BEGIN
    PERFORM pgmq.create('auth_emails');
  EXCEPTION
    WHEN duplicate_table OR duplicate_object THEN NULL;
    WHEN OTHERS THEN RAISE NOTICE 'auth_emails queue already unavailable or present: %', SQLERRM;
  END;

  BEGIN
    PERFORM pgmq.create('transactional_emails');
  EXCEPTION
    WHEN duplicate_table OR duplicate_object THEN NULL;
    WHEN OTHERS THEN RAISE NOTICE 'transactional_emails queue already unavailable or present: %', SQLERRM;
  END;
END $$;